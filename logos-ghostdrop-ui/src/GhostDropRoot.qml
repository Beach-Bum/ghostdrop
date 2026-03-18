// GhostDropRoot.qml
// Root view — mirrors App.jsx layout: sidebar + main content area.
// The "ghostDrop" context property (GhostDropBridge) is injected by C++.

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    anchors.fill: parent
    color: "#25262b"

    // ── Design tokens (matches JS :root CSS variables) ────────────
    QtObject {
        id: C
        readonly property color sidebar:     "#1e1f24"
        readonly property color bg:          "#25262b"
        readonly property color surface:     "#2c2e33"
        readonly property color surface2:    "#373a40"
        readonly property color border:      "#373a40"
        readonly property color accent:      "#0061ff"
        readonly property color accentHover: "#0052d9"
        readonly property color accentSoft:  "#1a2d5a"
        readonly property color textPrimary: "#f1f3f5"
        readonly property color textSecond:  "#909296"
        readonly property color textDim:     "#5c5f66"
        readonly property color green:       "#2f9e44"
        readonly property color greenSoft:   "#1a2e1e"
        readonly property color amber:       "#f59f00"
        readonly property color amberSoft:   "#2e2200"
        readonly property color red:         "#e03131"
        readonly property color redSoft:     "#2e1010"
        readonly property int  radius:       10
        readonly property int  radiusSm:     6
        readonly property string fontFamily: "Plus Jakarta Sans, -apple-system, sans-serif"
        readonly property string monoFamily: "SF Mono, Fira Code, monospace"
    }

    // ── State ────────────────────────────────────────────────────
    property string currentView: "source"   // "source" | "outlet" | "reader"

    // ── Sidebar ──────────────────────────────────────────────────
    Rectangle {
        id: sidebar
        width: 250
        anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
        color: C.sidebar

        ColumnLayout {
            anchors.fill: parent
            spacing: 0

            // Logo header
            Rectangle {
                Layout.fillWidth: true
                height: 70
                color: "transparent"
                Rectangle {
                    anchors { bottom: parent.bottom; left: parent.left; right: parent.right }
                    height: 1; color: C.border
                }
                RowLayout {
                    anchors { fill: parent; margins: 18 }
                    spacing: 11
                    Text { text: "👻"; font.pixelSize: 22 }
                    Column {
                        spacing: 2
                        Text {
                            text: "GhostDrop"
                            color: C.textPrimary
                            font { pixelSize: 16; bold: true }
                        }
                        Text {
                            text: "Decentralised · Private"
                            color: C.textDim
                            font.pixelSize: 11
                        }
                    }
                }
            }

            // Nav label
            Item { Layout.fillWidth: true; height: 8 }
            Text {
                Layout.leftMargin: 18
                text: "NAVIGATION"
                color: C.textDim
                font { pixelSize: 10; letterSpacing: 1.5 }
            }
            Item { Layout.fillWidth: true; height: 6 }

            // Nav items
            Repeater {
                model: [
                    { id: "source", icon: "↑", label: "Submit Document",  sub: "Send a document securely" },
                    { id: "outlet", icon: "◫", label: "Outlet Inbox",      sub: "Receive & publish" },
                    { id: "reader", icon: "≡", label: "Publications",      sub: "Browse & verify" },
                ]
                delegate: NavItem {
                    Layout.fillWidth: true
                    Layout.leftMargin: 10
                    Layout.rightMargin: 10
                    viewId: modelData.id
                    icon: modelData.icon
                    label: modelData.label
                    sublabel: modelData.sub
                    active: root.currentView === modelData.id
                    colors: C
                    onClicked: root.currentView = modelData.id
                }
            }

            Item { Layout.fillHeight: true }

            // Stack status footer
            Rectangle {
                Layout.fillWidth: true
                height: 1; color: C.border
            }
            Column {
                Layout.fillWidth: true
                padding: 16
                spacing: 0
                Text {
                    text: "STACK STATUS"
                    color: C.textDim
                    font { pixelSize: 10; letterSpacing: 1.2 }
                    bottomPadding: 10
                }
                StatusDot { label: "Logos Messaging";  status: ghostDrop.messagingStatus;  colors: C }
                StatusDot { label: "Logos Storage"; status: ghostDrop.storageStatus; colors: C }
                StatusDot { label: "Logos Blockchain"; status: ghostDrop.blockchainStatus; colors: C }
                Rectangle {
                    width: parent.width - 32
                    height: 50
                    color: C.surface
                    radius: C.radiusSm
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.topMargin: 12
                    Text {
                        anchors { fill: parent; margins: 10 }
                        text: "Logos Messaging: public fleet · Logos Storage/Logos Blockchain: run locally to activate"
                        color: C.textDim
                        font.pixelSize: 11
                        wrapMode: Text.WordWrap
                    }
                }
            }
        }
    }

    // ── Main content area ────────────────────────────────────────
    Rectangle {
        anchors {
            left: sidebar.right; right: parent.right
            top: parent.top; bottom: parent.bottom
        }
        color: C.bg

        // Top bar
        Rectangle {
            id: topBar
            anchors { top: parent.top; left: parent.left; right: parent.right }
            height: 56
            color: C.sidebar
            Rectangle {
                anchors { bottom: parent.bottom; left: parent.left; right: parent.right }
                height: 1; color: C.border
            }

            RowLayout {
                anchors { fill: parent; leftMargin: 28; rightMargin: 28 }
                Text {
                    text: {
                        if (root.currentView === "source") return "Submit Document"
                        if (root.currentView === "outlet") return "Outlet Inbox"
                        return "Publications"
                    }
                    color: C.textPrimary
                    font { pixelSize: 15; bold: true }
                }
                Item { Layout.fillWidth: true }
                // Status dots in topbar
                Row {
                    spacing: 16
                    Repeater {
                        model: [
                            { label: "Logos Messaging",  status: ghostDrop.messagingStatus },
                            { label: "Logos Storage", status: ghostDrop.storageStatus },
                            { label: "Logos Blockchain", status: ghostDrop.blockchainStatus },
                        ]
                        delegate: Row {
                            spacing: 6
                            Rectangle {
                                width: 7; height: 7
                                radius: 3.5
                                color: modelData.status === "active" ? C.green
                                     : modelData.status === "warn"   ? C.amber : C.textDim
                                anchors.verticalCenter: parent.verticalCenter
                            }
                            Text {
                                text: modelData.label
                                color: C.textDim
                                font.pixelSize: 12
                                anchors.verticalCenter: parent.verticalCenter
                            }
                        }
                    }
                }
            }
        }

        // Scrollable content
        ScrollView {
            anchors {
                top: topBar.bottom; left: parent.left
                right: parent.right; bottom: parent.bottom
            }
            contentWidth: availableWidth

            Item {
                width: parent.width
                implicitHeight: contentLoader.implicitHeight + 56

                Loader {
                    id: contentLoader
                    anchors { top: parent.top; left: parent.left; right: parent.right }
                    anchors.topMargin: 28
                    anchors.leftMargin: 28
                    anchors.rightMargin: 28
                    source: {
                        if (root.currentView === "source") return "SourceView.qml"
                        if (root.currentView === "outlet") return "OutletView.qml"
                        return "ReaderView.qml"
                    }
                    onLoaded: item.colors = C
                }
            }
        }
    }
}

// ── Inline component: NavItem ─────────────────────────────────────
component NavItem: Rectangle {
    property string viewId
    property string icon
    property string label
    property string sublabel
    property bool   active: false
    property var    colors
    signal clicked

    height: 52
    color: active ? colors.accentSoft : "transparent"
    radius: colors.radiusSm

    RowLayout {
        anchors { fill: parent; leftMargin: 12; rightMargin: 12 }
        spacing: 10
        Text {
            text: parent.parent.icon
            color: parent.parent.active ? colors.accent : colors.textSecond
            font.pixelSize: 16
            Layout.preferredWidth: 20
            horizontalAlignment: Text.AlignHCenter
        }
        Column {
            spacing: 3
            Text {
                text: parent.parent.label
                color: parent.parent.active ? colors.accent : colors.textSecond
                font { pixelSize: 13; bold: parent.parent.active }
            }
            Text {
                text: parent.parent.sublabel
                color: colors.textDim
                font.pixelSize: 11
            }
        }
    }
    MouseArea {
        anchors.fill: parent
        onClicked: parent.clicked()
        cursorShape: Qt.PointingHandCursor
    }
}

// ── Inline component: StatusDot ──────────────────────────────────
component StatusDot: Row {
    property string label
    property string status   // "active" | "warn" | "idle"
    property var    colors
    spacing: 8
    bottomPadding: 7

    Rectangle {
        width: 7; height: 7; radius: 3.5
        color: status === "active" ? colors.green
             : status === "warn"   ? colors.amber : colors.textDim
        anchors.verticalCenter: parent.verticalCenter

        SequentialAnimation on opacity {
            running: status === "active"
            loops: Animation.Infinite
            NumberAnimation { to: 0.3; duration: 900 }
            NumberAnimation { to: 1.0; duration: 900 }
        }
    }
    Text {
        text: label + "  "
        color: colors.textSecond
        font.pixelSize: 12
        anchors.verticalCenter: parent.verticalCenter
    }
    Text {
        text: status === "active" ? "live" : status === "warn" ? "mock" : "offline"
        color: colors.textDim
        font.pixelSize: 11
        anchors.verticalCenter: parent.verticalCenter
    }
}
