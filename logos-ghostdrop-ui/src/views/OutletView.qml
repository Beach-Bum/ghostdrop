// OutletView.qml — port of src/views/OutletView.jsx
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    implicitHeight: content.implicitHeight
    property var colors

    property string screen: "dashboard"  // dashboard|inbox|review|published|rejected
    property var    inbox: []
    property var    selected: null
    property string headline: ""
    property var    publishLog: []
    property var    publishedRecord: null
    property string rejectReason: ""
    property bool   publishing: false
    property bool   loadingInbox: false

    readonly property var OUTLET: ({
        id: "outlet_3",
        name: "Zero Knowledge Reports",
        address: "0x7f4a1b2c3d4e5f6789abcdef01234567890abcde",
        stake: "31,000 NOM",
        docs: 112,
        topic: "/logos-drop/1/submissions/outlet_3/proto"
    })

    Connections {
        target: ghostDrop
        function onInboxLoaded(items) {
            root.inbox = items
            root.loadingInbox = false
            root.screen = "inbox"
        }
        function onPublishLog(msg, color) {
            root.publishLog = root.publishLog.concat([{ msg: msg, color: color }])
        }
        function onPublishComplete(record) {
            root.publishedRecord = record
            root.publishing = false
            root.screen = "published"
        }
        function onPublishError(err) {
            root.publishing = false
            root.publishLog = root.publishLog.concat([{ msg: "✗ " + err, color: "#ff6b6b" }])
        }
    }

    Column {
        id: content
        anchors { left: parent.left; right: parent.right }
        spacing: 16

        // ── Dashboard ─────────────────────────────────────────────
        Item {
            visible: root.screen === "dashboard"
            width: parent.width
            implicitHeight: visible ? dashCol.implicitHeight : 0
            Column {
                id: dashCol
                width: parent.width
                spacing: 16

                SectionTitle { text: "Outlet Dashboard"; sub: OUTLET.name; colors: colors }

                Rectangle {
                    width: parent.width
                    color: colors.surface; border.color: colors.border; radius: colors.radius
                    padding: 20
                    implicitHeight: infoCol.implicitHeight + 40
                    Column {
                        id: infoCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 0
                        Repeater {
                            model: [
                                { label: "Outlet",          value: OUTLET.name },
                                { label: "Logos Blockchain", value: OUTLET.address },
                                { label: "Logos Messaging Topic",       value: OUTLET.topic },
                                { label: "Staked Bond",      value: OUTLET.stake },
                                { label: "Publications",     value: OUTLET.docs.toString() },
                            ]
                            delegate: Rectangle {
                                width: infoCol.width; height: 36
                                color: "transparent"
                                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: colors.border }
                                RowLayout {
                                    anchors.fill: parent
                                    Text { text: modelData.label; color: colors.textSecond; font.pixelSize: 13 }
                                    Item { Layout.fillWidth: true }
                                    Text {
                                        text: modelData.value
                                        color: colors.textPrimary
                                        font { pixelSize: 11; family: colors.monoFamily }
                                        elide: Text.ElideMiddle
                                        Layout.maximumWidth: 300
                                    }
                                }
                            }
                        }
                    }
                }

                Row {
                    spacing: 8
                    Rectangle { width: 7; height: 7; radius: 3.5; color: colors.green; anchors.verticalCenter: parent.verticalCenter }
                    Text { text: "Logos Messaging filter active — subscribed to submission topic"; color: colors.textSecond; font.pixelSize: 13 }
                }

                GButton {
                    label: root.loadingInbox ? "Loading inbox…" : "Open Encrypted Inbox"
                    enabled: !root.loadingInbox
                    colors: colors
                    onClicked: {
                        root.loadingInbox = true
                        ghostDrop.loadInbox(OUTLET.id)
                    }
                }
            }
        }

        // ── Inbox ─────────────────────────────────────────────────
        Item {
            visible: root.screen === "inbox"
            width: parent.width
            implicitHeight: visible ? inboxCol.implicitHeight : 0
            Column {
                id: inboxCol
                width: parent.width
                spacing: 16

                SectionTitle {
                    text: "Encrypted Inbox"
                    sub: root.inbox.length + " submissions · All end-to-end encrypted"
                    colors: colors
                }

                Rectangle {
                    width: parent.width
                    color: colors.surface; border.color: colors.border; radius: colors.radius
                    implicitHeight: inboxList.implicitHeight + 40

                    Column {
                        id: inboxList
                        anchors { fill: parent; margins: 0 }

                        // Header
                        Rectangle {
                            width: parent.width; height: 32
                            color: colors.surface2
                            radius: colors.radius
                            Row {
                                anchors { fill: parent; leftMargin: 18; rightMargin: 18 }
                                spacing: 0
                                Repeater {
                                    model: [
                                        { label: "Ephemeral Key", flex: 1 },
                                        { label: "Size",   flex: 0 },
                                        { label: "Type",   flex: 0 },
                                        { label: "Received", flex: 0 },
                                        { label: "Status", flex: 0 },
                                    ]
                                    delegate: Text {
                                        width: modelData.flex ? (inboxList.width - 18 * 2 - 280) : 70
                                        text: modelData.label
                                        color: colors.textDim
                                        font { pixelSize: 11; letterSpacing: 1.2 }
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                            }
                        }

                        Repeater {
                            model: root.inbox
                            delegate: Rectangle {
                                width: inboxList.width; height: 44
                                color: hov.containsMouse ? colors.surface2 : "transparent"
                                Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: colors.border }
                                Row {
                                    anchors { fill: parent; leftMargin: 18; rightMargin: 18 }
                                    spacing: 0
                                    Text { width: inboxList.width - 18*2 - 280; text: modelData.ephPub.substring(0,22) + "…"; color: "#74c0fc"; font { pixelSize: 11; family: colors.monoFamily }; anchors.verticalCenter: parent.verticalCenter }
                                    Text { width: 70; text: modelData.size;   color: colors.textSecond; font.pixelSize: 12; anchors.verticalCenter: parent.verticalCenter }
                                    Text { width: 70; text: modelData.type;   color: colors.textSecond; font.pixelSize: 12; anchors.verticalCenter: parent.verticalCenter }
                                    Text { width: 80; text: ghostDrop.fmtAgo(modelData.ts); color: colors.textSecond; font.pixelSize: 12; anchors.verticalCenter: parent.verticalCenter }
                                    Rectangle {
                                        width: 60; height: 22
                                        color: modelData.status === "unread" ? colors.accentSoft : colors.surface2
                                        radius: 4
                                        anchors.verticalCenter: parent.verticalCenter
                                        Text { anchors.centerIn: parent; text: modelData.status; color: modelData.status === "unread" ? colors.accent : colors.textDim; font.pixelSize: 11 }
                                    }
                                }
                                HoverHandler { id: hov }
                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        root.selected = modelData
                                        root.headline = ""
                                        root.publishLog = []
                                        root.rejectReason = ""
                                        root.screen = "review"
                                    }
                                }
                            }
                        }
                    }
                }
                GButton { label: "← Dashboard"; ghost: true; colors: colors; onClicked: root.screen = "dashboard" }
            }
        }

        // ── Review ────────────────────────────────────────────────
        Item {
            visible: root.screen === "review" && root.selected !== null
            width: parent.width
            implicitHeight: visible ? reviewCol.implicitHeight : 0
            Column {
                id: reviewCol
                width: parent.width
                spacing: 16

                SectionTitle { text: "Review Submission"; colors: colors }

                HashDisplay { label: "Source Ephemeral Pubkey"; value: root.selected ? root.selected.ephPub : ""; colors: colors; width: parent.width }

                Row {
                    spacing: 16
                    Text { text: "Received: " + (root.selected ? ghostDrop.fmtAgo(root.selected.ts) : ""); color: colors.textSecond; font.pixelSize: 13 }
                    Text { text: "Size: " + (root.selected ? root.selected.size : ""); color: colors.textSecond; font.pixelSize: 13 }
                    Text { text: "Type: " + (root.selected ? root.selected.type : ""); color: colors.textSecond; font.pixelSize: 13 }
                    Rectangle {
                        height: 22; width: stripBadge.width + 16; radius: 4
                        color: root.selected && root.selected.stripped ? colors.greenSoft : colors.amberSoft
                        Text {
                            id: stripBadge
                            anchors.centerIn: parent
                            text: root.selected && root.selected.stripped ? "✓ Strip attested" : "⚠ No attestation"
                            color: root.selected && root.selected.stripped ? colors.green : colors.amber
                            font.pixelSize: 11
                        }
                    }
                }

                // Encrypted doc placeholder
                Rectangle {
                    width: parent.width; height: 80
                    color: colors.surface2; radius: colors.radiusSm
                    Text { anchors.centerIn: parent; text: "ECIES ENCRYPTED — decrypt with outlet private key to view"; color: colors.textDim; font.pixelSize: 12 }
                }

                // Headline input
                Text { text: "Publication headline"; color: colors.textSecond; font.pixelSize: 13 }
                TextField {
                    width: reviewCol.width
                    placeholderText: "Enter headline…"
                    color: colors.textPrimary
                    background: Rectangle { color: colors.surface; border.color: colors.border; radius: colors.radiusSm }
                    onTextChanged: root.headline = text
                }

                LogTerminal {
                    visible: root.publishLog.length > 0
                    width: reviewCol.width
                    lines: root.publishLog
                    loading: root.publishing
                    colors: colors
                }

                RowLayout {
                    width: reviewCol.width
                    GButton { label: "← Inbox"; ghost: true; enabled: !root.publishing; colors: colors; onClicked: root.screen = "inbox" }
                    Item { Layout.fillWidth: true }
                    Row {
                        spacing: 8
                        TextField {
                            width: 180
                            placeholderText: "Rejection reason…"
                            color: colors.textPrimary
                            background: Rectangle { color: colors.surface; border.color: colors.border; radius: colors.radiusSm }
                            onTextChanged: root.rejectReason = text
                        }
                        GButton {
                            label: "Reject"
                            danger: true
                            enabled: root.rejectReason.trim() !== ""
                            colors: colors
                            onClicked: {
                                ghostDrop.rejectSubmission(
                                    root.selected.ephPub, OUTLET.id, root.rejectReason)
                                root.screen = "rejected"
                            }
                        }
                        GButton {
                            label: root.publishing ? "Publishing…" : "Publish → Logos Storage + Logos Blockchain"
                            enabled: !root.publishing && root.headline.trim() !== ""
                            colors: colors
                            onClicked: {
                                root.publishing = true
                                root.publishLog = []
                                ghostDrop.publishDocument(
                                    root.headline,
                                    "",   // doc bytes hex — mock for now
                                    "application/pdf",
                                    OUTLET.id,
                                    root.selected || {}
                                )
                            }
                        }
                    }
                }
            }
        }

        // ── Published ─────────────────────────────────────────────
        Item {
            visible: root.screen === "published" && root.publishedRecord !== null
            width: parent.width
            implicitHeight: visible ? pubCol.implicitHeight : 0
            Column {
                id: pubCol
                width: parent.width
                spacing: 16

                GAlert {
                    type: "success"
                    text: "✓ Document is live — pinned to Logos Storage, anchored on Logos Blockchain, announced via Logos Messaging."
                    colors: colors; width: parent.width
                }

                Rectangle {
                    width: parent.width
                    color: colors.surface; border.color: colors.border; radius: colors.radius
                    padding: 20
                    implicitHeight: pubContentCol.implicitHeight + 40
                    Column {
                        id: pubContentCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 12
                        Text {
                            text: root.publishedRecord ? root.publishedRecord.headline : ""
                            color: colors.textPrimary; font { pixelSize: 15; bold: true }
                            wrapMode: Text.WordWrap; width: parent.width
                        }
                        HashDisplay { label: "Logos Storage CID";                   value: root.publishedRecord ? root.publishedRecord.cid    : ""; colors: colors; width: parent.width }
                        HashDisplay { label: "Document Hash (SHA-256)";             value: root.publishedRecord ? root.publishedRecord.hash   : ""; colors: colors; width: parent.width }
                        HashDisplay { label: "Logos Blockchain Anchor Transaction"; value: root.publishedRecord ? root.publishedRecord.txHash : ""; colors: colors; width: parent.width }
                        GButton { label: "← Back to Inbox"; ghost: true; colors: colors; onClicked: { root.selected = null; root.publishedRecord = null; root.screen = "inbox" } }
                    }
                }
            }
        }

        // ── Rejected ──────────────────────────────────────────────
        Item {
            visible: root.screen === "rejected"
            width: parent.width
            implicitHeight: visible ? rejCol.implicitHeight : 0
            Column {
                id: rejCol
                width: parent.width
                spacing: 16
                GAlert { type: "info"; text: "✓ Rejection sent to source via Logos Messaging back-channel keyed to their ephemeral pubkey."; colors: colors; width: parent.width }
                GButton { label: "← Back to Inbox"; ghost: true; colors: colors; onClicked: { root.selected = null; root.screen = "inbox" } }
            }
        }
    }
}
