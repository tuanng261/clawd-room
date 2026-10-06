// Clawd's Room as a little window that floats in a corner of your Mac.
//
// A borderless panel shows the room's page in widget mode: a one-line pill, a
// corner view of the room, or the full app. The small sizes stay above other
// windows on every Space (even over full-screen apps) without stealing focus.
// Drag it anywhere and it snaps to the nearest corner; the menu bar icon shows,
// hides and resizes it. If the room's server isn't running, the app starts it.
//
// Build with widget/build.sh (for yourself: runs the server from this folder) or
// widget/package.sh (to share: the server's files go inside the app, and Node
// is found wherever the friend installed it).

import AppKit
import WebKit

struct Config: Decodable {
    let node: String?    // where the build machine had node (a hint)
    let project: String? // the project folder (dev builds); shared builds carry their own copy
    let port: Int
}

enum Mode: String {
    case pill, mini, full
}

/// Borderless, but still able to take clicks.
final class Panel: NSPanel {
    override var canBecomeKey: Bool { true }
}

/// A strip you grab to move the window. Clicks and double-clicks are passed on.
final class Grip: NSView {
    var onClick: (() -> Void)?
    var onDoubleClick: (() -> Void)?
    var onMoved: (() -> Void)?
    private var downAt = NSPoint.zero
    private var dragged = false

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .openHand) }

    override func mouseDown(with event: NSEvent) {
        downAt = event.locationInWindow
        dragged = false
        if event.clickCount == 2 { onDoubleClick?() }
    }

    override func mouseDragged(with event: NSEvent) {
        let p = event.locationInWindow
        guard !dragged, hypot(p.x - downAt.x, p.y - downAt.y) > 3 else { return }
        dragged = true
        window?.performDrag(with: event) // runs until the mouse goes up
        onMoved?()
    }

    override func mouseUp(with event: NSEvent) {
        if !dragged && event.clickCount == 1 { onClick?() }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private let config: Config
    private let defaults = UserDefaults.standard
    private var panel: Panel!
    private var web: WKWebView!
    private let grip = Grip()
    private var statusItem: NSStatusItem!
    private var server: Process?
    private var mode: Mode
    private var corner: String
    private var loaded = false
    private var noNode = false

    override init() {
        config = AppDelegate.loadConfig()
        let saved = Mode(rawValue: UserDefaults.standard.string(forKey: "mode") ?? "") ?? .mini
        mode = saved == .full ? .mini : saved
        corner = UserDefaults.standard.string(forKey: "corner") ?? "bottomRight"
        super.init()
    }

    private static func loadConfig() -> Config {
        if let url = Bundle.main.url(forResource: "config", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let config = try? JSONDecoder().decode(Config.self, from: data) {
            return config
        }
        return Config(node: nil, project: nil, port: 4747)
    }

    /// The room's server files: this project for a dev build, otherwise the copy inside the app.
    private var serverDir: String {
        if let p = config.project, FileManager.default.fileExists(atPath: p + "/bin/clawd-room.js") { return p }
        return (Bundle.main.resourcePath ?? "") + "/app"
    }

    /// Node.js: the build's hint, the usual install places, nvm/fnm, or whatever a login shell finds.
    private func findNode() -> String? {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser.path
        var candidates = [config.node, "/opt/homebrew/bin/node", "/usr/local/bin/node", "\(home)/.volta/bin/node",
                          "\(home)/.asdf/shims/node", "\(home)/.local/share/mise/shims/node", "\(home)/.nodenv/shims/node"].compactMap { $0 }
        for dir in ["\(home)/.nvm/versions/node", "\(home)/.local/share/fnm/node-versions", "\(home)/Library/Application Support/fnm/node-versions"] {
            let versions = (try? fm.contentsOfDirectory(atPath: dir)) ?? []
            for v in versions.sorted(by: { $0.compare($1, options: .numeric) == .orderedDescending }) {
                candidates.append("\(dir)/\(v)/bin/node")
                candidates.append("\(dir)/\(v)/installation/bin/node")
            }
        }
        if let found = candidates.first(where: { fm.isExecutableFile(atPath: $0) }) { return found }
        let shell = Process()
        shell.executableURL = URL(fileURLWithPath: "/bin/zsh")
        shell.arguments = ["-lc", "command -v node"]
        let pipe = Pipe()
        shell.standardOutput = pipe
        shell.standardError = FileHandle.nullDevice
        do { try shell.run() } catch { return nil }
        shell.waitUntilExit()
        let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return fm.isExecutableFile(atPath: out) ? out : nil
    }

    private var base: String { "http://127.0.0.1:\(config.port)" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildPanel()
        buildMenu()
        showMessage("Waking Clawd up…")
        startServerIfNeeded { [weak self] in self?.loadRoom() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.terminate() // only if we started it
    }

    // MARK: - The window

    private func buildPanel() {
        let rect = frame(for: mode)
        panel = Panel(contentRect: rect, styleMask: [.borderless, .nonactivatingPanel, .resizable], backing: .buffered, defer: false)
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.acceptsMouseMovedEvents = true
        panel.minSize = NSSize(width: 240, height: 56)
        panel.delegate = self

        let setup = WKWebViewConfiguration()
        setup.userContentController.add(self, name: "clawd")
        let bounds = NSRect(origin: .zero, size: rect.size)
        web = WKWebView(frame: bounds, configuration: setup)
        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        web.wantsLayer = true
        web.layer?.cornerRadius = 14
        web.layer?.masksToBounds = true

        let root = NSView(frame: bounds)
        root.wantsLayer = true
        root.addSubview(web)
        root.addSubview(grip)
        panel.contentView = root

        grip.onMoved = { [weak self] in self?.snapToCorner() }
        grip.onClick = { [weak self] in
            if self?.mode == .pill { self?.setMode(.mini) }
        }
        grip.onDoubleClick = { [weak self] in
            guard let self else { return }
            self.setMode(self.mode == .full ? .mini : .full)
        }
        layoutGrip()
        panel.orderFrontRegardless()
    }

    /// Where the window goes for a size: small ones sit in the chosen corner, the full view in the middle.
    private func frame(for m: Mode) -> NSRect {
        let screen = (panel?.screen ?? NSScreen.main ?? NSScreen.screens[0]).visibleFrame
        if m == .full {
            let w = min(1200, screen.width - 60)
            let h = min(780, screen.height - 60)
            return NSRect(x: screen.midX - w / 2, y: screen.midY - h / 2, width: w, height: h)
        }
        let size = m == .pill ? NSSize(width: 310, height: 60) : miniSize()
        let margin: CGFloat = 16
        let x = corner.hasSuffix("Left") ? screen.minX + margin : screen.maxX - margin - size.width
        let y = corner.hasPrefix("bottom") ? screen.minY + margin : screen.maxY - margin - size.height
        return NSRect(x: x, y: y, width: size.width, height: size.height)
    }

    private func miniSize() -> NSSize {
        let w = defaults.double(forKey: "miniWidth")
        let h = defaults.double(forKey: "miniHeight")
        return w >= 260 && h >= 200 ? NSSize(width: w, height: h) : NSSize(width: 380, height: 300)
    }

    /// The grab strip: the whole pill (minus its buttons), the top edge of the corner view, the logo in the full view.
    private func layoutGrip() {
        guard let b = panel.contentView?.bounds else { return }
        switch mode {
        case .pill: grip.frame = NSRect(x: 0, y: 0, width: max(0, b.width - 40), height: b.height)
        case .mini: grip.frame = NSRect(x: 0, y: b.height - 22, width: max(0, b.width - 120), height: 22)
        case .full: grip.frame = NSRect(x: 0, y: b.height - 64, width: 230, height: 64)
        }
        panel.invalidateCursorRects(for: grip)
    }

    private func setMode(_ m: Mode) {
        mode = m
        if m != .full { defaults.set(m.rawValue, forKey: "mode") }
        web.evaluateJavaScript("window.clawdWidget && window.clawdWidget.setMode('\(m.rawValue)')", completionHandler: nil)
        panel.level = m == .full ? .normal : .floating
        panel.setFrame(frame(for: m), display: true, animate: true)
        layoutGrip()
        if m == .full { NSApp.activate(ignoringOtherApps: true) }
        panel.orderFrontRegardless()
        panel.invalidateShadow()
        updateMenu()
    }

    private func snapToCorner() {
        guard mode != .full, let screen = panel.screen?.visibleFrame else { return }
        let c = NSPoint(x: panel.frame.midX, y: panel.frame.midY)
        corner = (c.y < screen.midY ? "bottom" : "top") + (c.x < screen.midX ? "Left" : "Right")
        defaults.set(corner, forKey: "corner")
        panel.setFrame(frame(for: mode), display: true, animate: true)
        updateMenu()
    }

    func windowDidEndLiveResize(_ notification: Notification) {
        // Resizing the corner view sets its size from now on; the pill keeps its own.
        if mode == .mini {
            defaults.set(panel.frame.width, forKey: "miniWidth")
            defaults.set(panel.frame.height, forKey: "miniHeight")
        }
        if mode != .full { snapToCorner() }
        layoutGrip()
    }

    private func toggleShown() {
        if panel.isVisible { panel.orderOut(nil) } else { panel.orderFrontRegardless() }
        updateMenu()
    }

    // MARK: - The page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "mode", let raw = body["mode"] as? String else { return }
        if raw == "hide" {
            panel.orderOut(nil)
            updateMenu()
        } else if let m = Mode(rawValue: raw) {
            setMode(m)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard loaded else { return }
        webView.evaluateJavaScript("window.clawdWidget && window.clawdWidget.setMode('\(mode.rawValue)')", completionHandler: nil)
        panel.invalidateShadow()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard loaded else { return }
        // The server went away: say so, and keep trying.
        showMessage("Waiting for Clawd's Room…")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            self?.startServerIfNeeded { self?.loadRoom() }
        }
    }

    private func loadRoom() {
        loaded = true
        if let url = URL(string: "\(base)/?widget&mode=\(mode.rawValue)") { web.load(URLRequest(url: url)) }
    }

    private func showMessage(_ text: String) {
        loaded = false
        web.loadHTMLString("""
        <html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;gap:12px;
          background:#faf9f5;border:2px solid #3d3929;border-radius:14px;box-sizing:border-box;
          font:600 13px -apple-system,sans-serif;color:#3d3929">
          <span style="width:30px;height:22px;background:#d97757;display:inline-block"></span>\(text)</body></html>
        """, baseURL: nil)
    }

    // MARK: - The server

    private func ping(_ done: @escaping (Bool) -> Void) {
        guard let url = URL(string: "\(base)/api/sessions") else { return done(false) }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5
        URLSession.shared.dataTask(with: request) { _, response, _ in
            let ok = (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async { done(ok) }
        }.resume()
    }

    private func startServerIfNeeded(then ready: @escaping () -> Void) {
        ping { [weak self] ok in
            guard let self else { return }
            if ok { return ready() }
            if self.server?.isRunning != true { self.launchServer() }
            if !self.noNode { self.waitForServer(tries: 60, then: ready) }
        }
    }

    private func launchServer() {
        guard let node = findNode() else {
            noNode = true
            showMessage("Clawd's Room needs Node.js: get it at nodejs.org, then reopen.")
            return
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: node)
        p.arguments = ["bin/clawd-room.js", "--port", String(config.port)]
        p.currentDirectoryURL = URL(fileURLWithPath: serverDir)
        let log = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/ClawdWidget.log")
        FileManager.default.createFile(atPath: log.path, contents: nil)
        if let handle = try? FileHandle(forWritingTo: log) {
            p.standardOutput = handle
            p.standardError = handle
        }
        do {
            try p.run()
            server = p
        } catch {
            NSLog("Clawd widget: couldn't start the server: \(error)")
        }
    }

    private func waitForServer(tries: Int, then ready: @escaping () -> Void) {
        ping { [weak self] ok in
            if ok { return ready() }
            guard tries > 0 else {
                self?.showMessage("Couldn't start Clawd's Room. Run npm start in the project.")
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self?.waitForServer(tries: tries - 1, then: ready)
            }
        }
    }

    // MARK: - Menu bar

    private var showItem: NSMenuItem!
    private var sizeItems: [Mode: NSMenuItem] = [:]
    private var cornerItems: [String: NSMenuItem] = [:]

    private func buildMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = AppDelegate.clawdIcon()
        statusItem.button?.toolTip = "Clawd's Room"

        let menu = NSMenu()
        showItem = item("Hide Clawd", "h") { [weak self] in self?.toggleShown() }
        menu.addItem(showItem)
        menu.addItem(.separator())
        for (m, title, key) in [(Mode.pill, "Pill", "1"), (.mini, "Corner view", "2"), (.full, "Full view", "3")] {
            let it = item(title, key) { [weak self] in self?.setMode(m) }
            sizeItems[m] = it
            menu.addItem(it)
        }
        menu.addItem(.separator())
        let corners = NSMenu()
        for (id, title) in [("topLeft", "Top left"), ("topRight", "Top right"), ("bottomLeft", "Bottom left"), ("bottomRight", "Bottom right")] {
            let it = item(title, "") { [weak self] in
                guard let self else { return }
                self.corner = id
                self.defaults.set(id, forKey: "corner")
                if self.mode == .full { self.setMode(.mini) } else { self.setMode(self.mode) }
            }
            cornerItems[id] = it
            corners.addItem(it)
        }
        let cornerMenu = NSMenuItem(title: "Corner", action: nil, keyEquivalent: "")
        cornerMenu.submenu = corners
        menu.addItem(cornerMenu)
        menu.addItem(item("Open in browser", "o") { [weak self] in
            guard let self, let url = URL(string: self.base) else { return }
            NSWorkspace.shared.open(url)
        })
        menu.addItem(.separator())
        menu.addItem(item("Quit Clawd Widget", "q") { NSApp.terminate(nil) })
        statusItem.menu = menu
        updateMenu()
    }

    private func updateMenu() {
        showItem?.title = panel.isVisible ? "Hide Clawd" : "Show Clawd"
        for (m, it) in sizeItems { it.state = m == mode ? .on : .off }
        for (id, it) in cornerItems { it.state = id == corner ? .on : .off }
    }

    private var actions: [MenuAction] = []

    private func item(_ title: String, _ key: String, _ run: @escaping () -> Void) -> NSMenuItem {
        let action = MenuAction(run)
        actions.append(action)
        let it = NSMenuItem(title: title, action: #selector(MenuAction.fire), keyEquivalent: key)
        it.target = action
        return it
    }

    /// Clawd in pixels (same sprite as the page's icon), as a menu bar template image.
    private static func clawdIcon() -> NSImage {
        let rects: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
            (3, 0, 12, 2), (3, 2, 2, 2), (6, 2, 6, 2), (13, 2, 2, 2), (1, 4, 16, 2), (3, 6, 12, 2),
            (4, 8, 1, 2), (6, 8, 1, 2), (11, 8, 1, 2), (13, 8, 1, 2),
        ]
        let image = NSImage(size: NSSize(width: 18, height: 14), flipped: true) { _ in
            NSColor.black.setFill()
            for (x, y, w, h) in rects { NSRect(x: x, y: y + 2, width: w, height: h).fill() }
            return true
        }
        image.isTemplate = true
        return image
    }
}

/// Menu items call closures.
final class MenuAction: NSObject {
    private let run: () -> Void
    init(_ run: @escaping () -> Void) { self.run = run }
    @objc func fire() { run() }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
