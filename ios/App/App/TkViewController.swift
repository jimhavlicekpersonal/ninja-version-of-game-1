import UIKit
import Capacitor

/// Registers the game's own native plugins with Capacitor.
class TkViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TkStorePlugin())
        bridge?.registerPluginInstance(TkAuthPlugin())
        bridge?.registerPluginInstance(TkAgePlugin())
    }

    /// Low memory (device F19): tell the game, which drops painted art no scene shows
    /// (window event "tkmemorywarning", main.ts), instead of WebKit killing the web content.
    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        bridge?.triggerWindowJSEvent(eventName: "tkmemorywarning")
    }
}
