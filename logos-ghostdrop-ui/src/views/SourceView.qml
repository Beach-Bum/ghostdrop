// SourceView.qml
// Native QML port of src/views/SourceView.jsx
// Steps: Upload → Strip → Outlet → Encrypt & Send → Receipt

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Qt.labs.platform as Platform

Item {
    id: root
    implicitHeight: content.implicitHeight
    property var colors   // injected by GhostDropRoot

    // ── State ─────────────────────────────────────────────────────
    property int  step: 0
    property string fileName: ""
    property string fileMime: ""
    property string fileDataHex: ""    // hex of raw bytes
    property string strippedHex: ""    // hex of stripped bytes
    property var    scanResult: null
    property var    stripReport: null
    property var    outlets: null
    property var    selectedOutlet: null
    property string coverNote: ""
    property var    receipt: null
    property var    submitLogLines: []
    property var    backMessages: []
    property bool   submitting: false
    property bool   stripping: false

    readonly property var STEPS: ["Upload", "Strip", "Outlet", "Encrypt & Send", "Receipt"]

    // ── Bridge events ─────────────────────────────────────────────
    Connections {
        target: ghostDrop

        function onStripProgress(stage, pct) {
            stripProgressStage.text = stage + " (" + pct + "%)"
            stripProgressBar.value  = pct / 100.0
        }
        function onStripComplete(report, strHex) {
            root.stripReport  = report
            root.strippedHex  = strHex
            root.stripping    = false
        }
        function onStripError(err) {
            root.stripping = false
            root.stripReport = { "error": err }
        }
        function onOutletsLoaded(outlets) {
            root.outlets = outlets
            root.step    = 2
        }
        function onSubmitLog(msg, color) {
            root.submitLogLines = root.submitLogLines.concat([{ msg: msg, color: color }])
        }
        function onSubmitComplete(rec) {
            root.receipt   = rec
            root.submitting = false
            root.step       = 4
        }
        function onSubmitError(err) {
            root.submitting = false
            root.submitLogLines = root.submitLogLines.concat([{ msg: "✗ " + err, color: "#ff6b6b" }])
        }
        function onBackChannelMessages(msgs) {
            root.backMessages = msgs
        }
    }

    // ── File picker ───────────────────────────────────────────────
    Platform.FileDialog {
        id: filePicker
        title: "Select document to submit"
        onAccepted: {
            var path = currentFile.toString().replace("file://", "")
            ghostDrop.readFile(path, function(hex, mime) {
                root.fileName   = path.split("/").pop()
                root.fileMime   = mime
                root.fileDataHex = hex
                root.scanResult  = ghostDrop.scanFile(hex, mime)
            })
        }
    }

    // ── Step bar ──────────────────────────────────────────────────
    Column {
        id: content
        anchors { left: parent.left; right: parent.right }
        spacing: 0

        // Step pills
        Row {
            spacing: 6; bottomPadding: 28
            Repeater {
                model: root.STEPS
                delegate: Rectangle {
                    height: 28
                    radius: 14
                    property bool done:   index < root.step
                    property bool active: index === root.step
                    color: done   ? colors.greenSoft
                         : active ? colors.accentSoft
                                  : "transparent"
                    border.color: done   ? colors.green
                                : active ? colors.accent
                                         : colors.border
                    width: lbl.width + 24

                    Row {
                        anchors.centerIn: parent
                        spacing: 6
                        Text {
                            text: done ? "✓" : (index + 1).toString()
                            color: done   ? colors.green
                                 : active ? colors.accent
                                          : colors.textDim
                            font.pixelSize: 12
                            anchors.verticalCenter: parent.verticalCenter
                        }
                        Text {
                            id: lbl
                            text: modelData
                            color: done   ? colors.green
                                 : active ? colors.accent
                                          : colors.textDim
                            font.pixelSize: 12
                            anchors.verticalCenter: parent.verticalCenter
                        }
                    }
                }
            }
        }

        // ── STEP 0: Upload ────────────────────────────────────────
        Item {
            visible: root.step === 0
            width: parent.width
            implicitHeight: visible ? col0.implicitHeight : 0

            Column {
                id: col0
                width: parent.width
                spacing: 16

                SectionTitle { text: "Document Upload"; sub: "Your document is processed entirely locally. Nothing leaves until you submit in step 4."; colors: colors }

                // Drop zone
                Rectangle {
                    width: parent.width
                    height: 140
                    radius: colors.radius
                    color: root.fileDataHex ? colors.accentSoft : "transparent"
                    border { color: root.fileDataHex ? colors.accent : colors.border; width: 2 }
                    property bool isDragOver: false

                    DropArea {
                        anchors.fill: parent
                        onEntered: parent.isDragOver = true
                        onExited:  parent.isDragOver = false
                        onDropped: {
                            parent.isDragOver = false
                            if (drop.hasUrls) {
                                var path = drop.urls[0].toString().replace("file://","")
                                ghostDrop.readFileFromPath(path)
                            }
                        }
                    }

                    Column {
                        anchors.centerIn: parent
                        spacing: 8

                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: root.fileDataHex ? "📄" : "↑"
                            font.pixelSize: root.fileDataHex ? 32 : 36
                            opacity: root.fileDataHex ? 1.0 : 0.4
                        }
                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: root.fileDataHex ? root.fileName
                                                   : "DROP FILE HERE"
                            color: root.fileDataHex ? colors.accent : colors.textSecond
                            font { pixelSize: 14; bold: true }
                        }
                        Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: root.fileDataHex ? root.fileMime
                                                   : "or click to browse · PDF, DOCX, ZIP, images"
                            color: colors.textDim
                            font.pixelSize: 12
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: filePicker.open()
                    }
                }

                Row {
                    spacing: 12
                    GButton {
                        label: "◈ Load demo file"
                        ghost: true
                        colors: colors
                        onClicked: {
                            var demo = "CONFIDENTIAL INTERNAL MEMO\n\nFrom: Compliance Officer\nTo: Executive Team\n\n[DEMO DOCUMENT]"
                            root.fileName    = "demo_memo.txt"
                            root.fileMime    = "text/plain"
                            root.fileDataHex = ghostDrop.stringToHex(demo)
                            root.scanResult  = ghostDrop.scanFile(root.fileDataHex, root.fileMime)
                        }
                    }
                    GButton {
                        label: "Next: Strip Metadata →"
                        enabled: root.fileDataHex !== ""
                        colors: colors
                        onClicked: root.step = 1
                    }
                }
            }
        }

        // ── STEP 1: Strip ─────────────────────────────────────────
        Item {
            visible: root.step === 1
            width: parent.width
            implicitHeight: visible ? col1.implicitHeight : 0

            Column {
                id: col1
                width: parent.width
                spacing: 16

                SectionTitle { text: "Metadata Removal"; colors: colors }

                // Scan results
                Rectangle {
                    width: parent.width
                    color: colors.surface
                    border.color: colors.border
                    radius: colors.radius
                    padding: 20
                    implicitHeight: scanCol.implicitHeight + 40

                    Column {
                        id: scanCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 12

                        Text {
                            text: root.fileName
                            color: colors.textPrimary
                            font { pixelSize: 14; bold: true }
                        }

                        // Scan result fields
                        Repeater {
                            model: root.scanResult ? root.scanResult.fields : []
                            delegate: Row {
                                spacing: 10
                                Text {
                                    text: { var r=modelData.risk; return r==="critical"?"🔴":r==="high"?"🟠":r==="medium"?"🟡":"🔵" }
                                    font.pixelSize: 14
                                }
                                Text {
                                    text: modelData.field + ":  " + modelData.value.substring(0, 50)
                                    color: colors.textSecond
                                    font.pixelSize: 13
                                }
                            }
                        }

                        // GPS warning
                        GAlert {
                            visible: root.scanResult && root.scanResult.hasGPS
                            type: "danger"
                            text: "🔴 GPS coordinates detected — your precise location is embedded in this file."
                            colors: colors
                        }

                        // Strip progress
                        Column {
                            visible: root.stripping
                            width: parent.width
                            spacing: 8
                            Row {
                                spacing: 10
                                BusyIndicator { width: 16; height: 16; running: true }
                                Text {
                                    id: stripProgressStage
                                    text: "Scanning…"
                                    color: colors.textSecond
                                    font.pixelSize: 13
                                    anchors.verticalCenter: parent.verticalCenter
                                }
                            }
                            Rectangle {
                                width: parent.width; height: 4
                                color: colors.surface2; radius: 2
                                Rectangle {
                                    id: stripProgressBar
                                    property real value: 0
                                    width: parent.width * value
                                    height: 4; radius: 2
                                    color: colors.accent
                                    Behavior on width { NumberAnimation { duration: 200 } }
                                }
                            }
                        }

                        // Strip result
                        Column {
                            visible: root.stripReport !== null && !root.stripping
                            width: parent.width
                            spacing: 8

                            GAlert {
                                visible: root.stripReport && !root.stripReport.error
                                type: "success"
                                text: root.stripReport
                                    ? ("✓ Strip complete via " + root.stripReport.technique
                                       + " · " + (root.stripReport.fieldsRemoved || []).length + " fields removed")
                                    : ""
                                colors: colors
                            }

                            Repeater {
                                model: root.stripReport ? (root.stripReport.fieldsRemoved || []) : []
                                delegate: Row {
                                    spacing: 8
                                    Text { text: "✓"; color: colors.green; font.pixelSize: 13 }
                                    Text {
                                        text: modelData.field
                                        color: colors.textDim
                                        font.pixelSize: 12
                                    }
                                }
                            }

                            GAlert {
                                visible: root.stripReport && root.stripReport.error
                                type: "danger"
                                text: root.stripReport ? "✗ Strip failed: " + root.stripReport.error : ""
                                colors: colors
                            }
                        }

                        // Buttons
                        Row {
                            spacing: 12
                            GButton {
                                label: "← Back"
                                ghost: true; colors: colors
                                onClicked: root.step = 0
                            }
                            GButton {
                                label: "Run Metadata Strip"
                                visible: !root.stripping && !root.stripReport
                                colors: colors
                                onClicked: {
                                    root.stripping = true
                                    root.stripReport = null
                                    ghostDrop.stripFile(root.fileDataHex, root.fileMime, root.fileName)
                                }
                            }
                            GButton {
                                label: "Select Outlet →"
                                visible: root.stripReport !== null && !root.stripReport.error && !root.stripping
                                colors: colors
                                onClicked: ghostDrop.loadOutlets()
                            }
                            GButton {
                                label: "Proceed without strip →"
                                visible: root.stripReport && root.stripReport.error
                                ghost: true; colors: colors
                                onClicked: ghostDrop.loadOutlets()
                            }
                        }
                    }
                }
            }
        }

        // ── STEP 2: Outlet ────────────────────────────────────────
        Item {
            visible: root.step === 2
            width: parent.width
            implicitHeight: visible ? col2.implicitHeight : 0

            Column {
                id: col2
                width: parent.width
                spacing: 16

                SectionTitle {
                    text: "Select Publication Outlet"
                    sub: "Outlets are registered on Logos Blockchain. Stake is their credibility bond."
                    colors: colors
                }

                Repeater {
                    model: root.outlets || []
                    delegate: Rectangle {
                        width: col2.width
                        height: 80
                        radius: colors.radius
                        color: root.selectedOutlet && root.selectedOutlet.id === modelData.id
                               ? colors.accentSoft : colors.surface
                        border {
                            width: 1.5
                            color: root.selectedOutlet && root.selectedOutlet.id === modelData.id
                                   ? colors.accent : colors.border
                        }

                        RowLayout {
                            anchors { fill: parent; margins: 16 }
                            Column {
                                spacing: 4
                                Text {
                                    text: (root.selectedOutlet && root.selectedOutlet.id === modelData.id ? "✓ " : "") + modelData.name
                                    color: colors.textPrimary
                                    font { pixelSize: 14; bold: true }
                                }
                                Text {
                                    text: modelData.topic
                                    color: colors.textDim
                                    font { pixelSize: 11; family: colors.monoFamily }
                                }
                            }
                            Item { Layout.fillWidth: true }
                            Column {
                                spacing: 3
                                horizontalItemAlignment: Qt.AlignRight
                                Text {
                                    text: modelData.stake
                                    color: colors.accent
                                    font { pixelSize: 13; bold: true }
                                }
                                Text {
                                    text: modelData.docs + " publications"
                                    color: colors.textDim
                                    font.pixelSize: 12
                                }
                            }
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.selectedOutlet = modelData
                        }
                    }
                }

                TextArea {
                    width: col2.width
                    placeholderText: "Cover note (optional — encrypted, only the outlet can read it)"
                    color: colors.textPrimary
                    background: Rectangle { color: colors.surface; border.color: colors.border; radius: colors.radiusSm }
                    font.pixelSize: 13
                    height: 90
                    wrapMode: Text.WordWrap
                    onTextChanged: root.coverNote = text
                }

                Row {
                    spacing: 12
                    GButton { label: "← Back"; ghost: true; colors: colors; onClicked: root.step = 1 }
                    GButton {
                        label: "Next: Encrypt & Submit →"
                        enabled: root.selectedOutlet !== null
                        colors: colors
                        onClicked: root.step = 3
                    }
                }
            }
        }

        // ── STEP 3: Submit ────────────────────────────────────────
        Item {
            visible: root.step === 3
            width: parent.width
            implicitHeight: visible ? col3.implicitHeight : 0

            Column {
                id: col3
                width: parent.width
                spacing: 16

                SectionTitle { text: "Review & Transmit"; colors: colors }

                Rectangle {
                    width: parent.width
                    color: colors.surface
                    border.color: colors.border
                    radius: colors.radius
                    padding: 20
                    implicitHeight: reviewCol.implicitHeight + 40

                    Column {
                        id: reviewCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 0

                        Repeater {
                            model: [
                                { label: "Document",   value: root.fileName },
                                { label: "Outlet",     value: root.selectedOutlet ? root.selectedOutlet.name : "" },
                                { label: "Metadata",   value: root.stripReport && !root.stripReport.error
                                    ? "✓ " + (root.stripReport.fieldsRemoved || []).length + " fields stripped"
                                    : "⚠ Not stripped" },
                                { label: "Encryption", value: "ECIES — secp256k1 + AES-256-GCM" },
                                { label: "IP exposed", value: "✓ None — Logos Messaging gossip" },
                                { label: "Identity",   value: "✓ None — ephemeral key only" },
                            ]
                            delegate: Rectangle {
                                width: reviewCol.width
                                height: 36
                                color: "transparent"
                                border.color: "transparent"
                                Rectangle {
                                    anchors.bottom: parent.bottom
                                    width: parent.width; height: 1
                                    color: colors.border
                                }
                                RowLayout {
                                    anchors { fill: parent; topMargin: 0; bottomMargin: 0 }
                                    Text {
                                        text: modelData.label
                                        color: colors.textSecond
                                        font.pixelSize: 14
                                    }
                                    Item { Layout.fillWidth: true }
                                    Text {
                                        text: modelData.value
                                        color: modelData.value.startsWith("✓") ? colors.green
                                             : modelData.value.startsWith("⚠") ? colors.amber
                                             : colors.textPrimary
                                        font.pixelSize: 13
                                    }
                                }
                            }
                        }
                    }
                }

                // Submit log terminal
                LogTerminal {
                    visible: root.submitLogLines.length > 0
                    width: col3.width
                    lines: root.submitLogLines
                    loading: root.submitting
                    colors: colors
                }

                Row {
                    spacing: 12
                    GButton {
                        label: "← Back"
                        ghost: true; enabled: !root.submitting
                        colors: colors
                        onClicked: root.step = 2
                    }
                    GButton {
                        label: root.submitting ? "Transmitting…" : "🔒 Encrypt & Submit via Logos Messaging"
                        enabled: !root.submitting
                        colors: colors
                        onClicked: {
                            root.submitting = true
                            root.submitLogLines = []
                            var bytesHex = root.strippedHex !== "" ? root.strippedHex : root.fileDataHex
                            ghostDrop.submitDocument(
                                bytesHex, root.fileMime,
                                root.selectedOutlet.id, root.selectedOutlet.pubKeyHex,
                                root.selectedOutlet.topic, root.coverNote,
                                root.stripReport || {}
                            )
                        }
                    }
                }
            }
        }

        // ── STEP 4: Receipt ───────────────────────────────────────
        Item {
            visible: root.step === 4
            width: parent.width
            implicitHeight: visible ? col4.implicitHeight : 0

            Column {
                id: col4
                width: parent.width
                spacing: 16

                GAlert {
                    type: "success"
                    text: root.receipt
                        ? ("✓ Delivered to outlet via Logos Messaging · End-to-end encrypted · msgId: "
                           + (root.receipt.msgId || "").substring(0, 20) + "…")
                        : ""
                    colors: colors
                    width: col4.width
                }

                // Claim key
                Rectangle {
                    width: col4.width
                    color: colors.surface
                    border.color: colors.border
                    radius: colors.radius
                    padding: 20
                    implicitHeight: claimCol.implicitHeight + 40

                    Column {
                        id: claimCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 12

                        Text { text: "Your Claim Key"; color: colors.textPrimary; font { pixelSize: 15; bold: true } }
                        Text {
                            width: parent.width
                            text: "This 12-word phrase is your only proof of submission and tip claim key. Save it — it is NOT stored anywhere."
                            color: colors.textSecond; font.pixelSize: 13; wrapMode: Text.WordWrap
                        }
                        GAlert { type: "warning"; text: "⚠ Cannot be recovered if lost"; colors: colors; width: parent.width }
                        Rectangle {
                            width: parent.width
                            height: mnemonicText.height + 32
                            color: colors.surface2
                            border.color: colors.amber
                            radius: colors.radiusSm
                            Text {
                                id: mnemonicText
                                anchors { left: parent.left; right: parent.right; top: parent.top; margins: 16 }
                                text: root.receipt ? root.receipt.mnemonic : ""
                                color: colors.textPrimary
                                font { pixelSize: 14; family: colors.monoFamily }
                                wrapMode: Text.WordWrap
                                lineHeight: 2.2
                            }
                        }

                        HashDisplay { label: "Ephemeral Public Key"; value: root.receipt ? root.receipt.ephPubHex : ""; colors: colors; width: parent.width }
                        HashDisplay { label: "Document Hash (SHA-256)"; value: root.receipt ? root.receipt.docHash : ""; colors: colors; width: parent.width }
                        HashDisplay { label: "Logos Messaging Message ID"; value: root.receipt ? root.receipt.msgId : ""; colors: colors; width: parent.width }
                    }
                }

                // Back-channel
                Rectangle {
                    width: col4.width
                    color: colors.surface
                    border.color: colors.border
                    radius: colors.radius
                    padding: 20
                    implicitHeight: bcCol.implicitHeight + 40

                    Column {
                        id: bcCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 12

                        Text { text: "Back-Channel"; color: colors.textPrimary; font { pixelSize: 14; bold: true } }
                        Text {
                            width: parent.width
                            text: "Poll the Logos Messaging Store for outlet responses. Passive — no persistent connection."
                            color: colors.textSecond; font.pixelSize: 13; wrapMode: Text.WordWrap
                        }

                        Repeater {
                            model: root.backMessages
                            delegate: Rectangle {
                                width: bcCol.width
                                height: bcMsgCol.implicitHeight + 24
                                color: colors.surface2; radius: colors.radiusSm
                                Column {
                                    id: bcMsgCol
                                    anchors { fill: parent; margins: 12 }
                                    spacing: 4
                                    Text { text: ghostDrop.fmtAgo(modelData.timestamp || 0); color: colors.textDim; font.pixelSize: 11 }
                                    Text { text: modelData.text || ""; color: colors.textPrimary; font.pixelSize: 13; wrapMode: Text.WordWrap; width: parent.width }
                                }
                            }
                        }

                        GButton {
                            label: "Poll Back-Channel"
                            ghost: true; colors: colors
                            visible: root.backMessages.length === 0
                            onClicked: ghostDrop.pollBackChannel(root.receipt ? root.receipt.ephPubHex : "")
                        }
                    }
                }

                GButton {
                    label: "Submit Another Document"
                    ghost: true; colors: colors
                    onClicked: {
                        root.step = 0
                        root.fileName = ""; root.fileMime = ""; root.fileDataHex = ""
                        root.strippedHex = ""; root.scanResult = null; root.stripReport = null
                        root.selectedOutlet = null; root.receipt = null
                        root.submitLogLines = []; root.backMessages = []
                        root.coverNote = ""
                    }
                }
            }
        }
    }
}
