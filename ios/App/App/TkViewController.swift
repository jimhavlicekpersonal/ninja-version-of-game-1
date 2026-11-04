import UIKit
import Capacitor

/// Registers the game's own native plugins with Capacitor.
class TkViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TkStorePlugin())
        bridge?.registerPluginInstance(TkAuthPlugin())
    }
}
