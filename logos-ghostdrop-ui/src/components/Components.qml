// Components.qml — shared components used across all views
// Import these inline via component declarations or as separate files.
// Each view imports them via their local namespace.

// ─── GButton ─────────────────────────────────────────────────────
// Usage: GButton { label: "Click me"; onClicked: ... }
import QtQuick
import QtQuick.Controls

component GButton: Rectangle {
    property string label: "Button"
    property bool   ghost: false
    property bool   danger: false
    property bool   enabled: true
    property var    colors

    signal clicked

    height: 36
    width: btnLabel.width + 36
    radius: colors ? colors.radiusSm : 6
    opacity: enabled ? 1.0 : 0.45
    color: danger ? (hov.containsMouse ? "#3a1515" : "#2e1010")
         : ghost  ? "transparent"
                  : (hov.containsMouse ? (colors ? colors.accentHover : "#0052d9")
                                       : (colors ? colors.accent : "#0061ff"))
    border {
        width: ghost || danger ? 1 : 0
        color: danger ? (colors ? colors.red : "#e03131")
             : ghost  ? (colors ? colors.border : "#373a40")
                      : "transparent"
    }

    Text {
        id: btnLabel
        anchors.centerIn: parent
        text: parent.label
        color: parent.danger ? (colors ? colors.red : "#e03131")
             : parent.ghost  ? (colors ? colors.textSecond : "#909296")
                             : "white"
        font { pixelSize: 14; bold: !parent.ghost }
    }

    HoverHandler { id: hov }
    MouseArea {
        anchors.fill: parent
        enabled: parent.enabled
        cursorShape: Qt.PointingHandCursor
        onClicked: parent.clicked()
    }
}

// ─── GAlert ──────────────────────────────────────────────────────
component GAlert: Rectangle {
    property string type: "info"   // info | success | warning | danger
    property string text: ""
    property var    colors

    height: alertText.implicitHeight + 22
    radius: colors ? colors.radiusSm : 6
    color: type === "success" ? (colors ? colors.greenSoft  : "#1a2e1e")
         : type === "warning" ? (colors ? colors.amberSoft  : "#2e2200")
         : type === "danger"  ? (colors ? colors.redSoft    : "#2e1010")
                              : (colors ? colors.accentSoft : "#1a2d5a")
    border.color: type === "success" ? (colors ? colors.green  : "#2f9e44")
                : type === "warning" ? (colors ? colors.amber  : "#f59f00")
                : type === "danger"  ? (colors ? colors.red    : "#e03131")
                                     : (colors ? colors.accent : "#0061ff")
    border.width: 1

    Text {
        id: alertText
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 11 }
        text: parent.text
        color: parent.type === "success" ? (colors ? colors.green  : "#2f9e44")
             : parent.type === "warning" ? (colors ? colors.amber  : "#f59f00")
             : parent.type === "danger"  ? (colors ? colors.red    : "#e03131")
                                         : (colors ? colors.accent : "#0061ff")
        font.pixelSize: 13
        wrapMode: Text.WordWrap
    }
}

// ─── HashDisplay ─────────────────────────────────────────────────
component HashDisplay: Rectangle {
    property string label: ""
    property string value: ""
    property var    colors

    height: hashCol.implicitHeight + 20
    color: colors ? colors.surface2 : "#373a40"
    radius: colors ? colors.radiusSm : 6

    Column {
        id: hashCol
        anchors { fill: parent; margins: 10 }
        spacing: 4

        Text {
            visible: parent.parent.label !== ""
            text: parent.parent.label.toUpperCase()
            color: colors ? colors.textDim : "#5c5f66"
            font { pixelSize: 10; letterSpacing: 1.2 }
        }
        RowLayout {
            width: parent.width
            Text {
                Layout.fillWidth: true
                text: parent.parent.parent.value
                color: "#74c0fc"
                font { pixelSize: 11; family: colors ? colors.monoFamily : "monospace" }
                wrapMode: Text.WrapAnywhere
                elide: Text.ElideRight
                maximumLineCount: 2
            }
            Rectangle {
                width: copyBtn.width + 16; height: 22
                color: copyHov.containsMouse ? (colors ? colors.surface : "#2c2e33") : "transparent"
                border.color: colors ? colors.border : "#373a40"
                radius: 4
                Text {
                    id: copyBtn
                    anchors.centerIn: parent
                    text: copyTimer.running ? "✓" : "Copy"
                    color: colors ? colors.textSecond : "#909296"
                    font.pixelSize: 11
                }
                HoverHandler { id: copyHov }
                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        ghostDrop.copyToClipboard(parent.parent.parent.parent.parent.value)
                        copyTimer.restart()
                    }
                }
                Timer { id: copyTimer; interval: 1500 }
            }
        }
    }
}

// ─── LogTerminal ─────────────────────────────────────────────────
component LogTerminal: Rectangle {
    property var    lines: []
    property bool   loading: false
    property var    colors

    height: Math.min(200, logContent.implicitHeight + 28)
    color: "#0d0e12"
    border.color: colors ? colors.border : "#373a40"
    radius: colors ? colors.radiusSm : 6
    clip: true

    ScrollView {
        anchors { fill: parent; margins: 14 }
        contentWidth: availableWidth

        Column {
            id: logContent
            width: parent.width
            spacing: 0

            Repeater {
                model: lines
                delegate: Text {
                    width: logContent.width
                    text: modelData.msg
                    color: modelData.color || "#adb5bd"
                    font { pixelSize: 12; family: colors ? colors.monoFamily : "monospace" }
                    wrapMode: Text.WordWrap
                    lineHeight: 1.9
                }
            }
            Row {
                visible: loading
                spacing: 8
                BusyIndicator { width: 14; height: 14; running: true }
                Text {
                    text: "_"
                    color: "#555"
                    font { pixelSize: 12; family: colors ? colors.monoFamily : "monospace" }
                    anchors.verticalCenter: parent.verticalCenter
                }
            }
        }
    }
}

// ─── SectionTitle ────────────────────────────────────────────────
component SectionTitle: Column {
    property string text: ""
    property string sub: ""
    property var    colors

    bottomPadding: 20
    spacing: 4
    Text {
        text: parent.text
        color: colors ? colors.textPrimary : "#f1f3f5"
        font { pixelSize: 17; bold: true }
    }
    Text {
        visible: parent.sub !== ""
        text: parent.sub
        color: colors ? colors.textSecond : "#909296"
        font.pixelSize: 13
        wrapMode: Text.WordWrap
        width: 640
    }
}
