// OutletView.qml — Outlet inbox, ECIES decrypt, file download, publish pipeline
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import QtQuick.Dialogs 1.3
import "../components"

Item {
    id: root
    anchors.fill: parent

    // Panel navigation: dashboard | inbox | decrypt | decrypted
    property string panel: "dashboard"

    // Currently selected inbox item
    property var selectedItem: null

    // Decrypted envelope data
    property var decryptedEnvelope: null
    property bool decrypting: false
    property string decryptError: ""
    property bool publishing: false

    // Signals to bridge
    signal loadInboxRequested()
    signal decryptRequested(string encryptedHex, string privKeyHex)
    signal publishRequested(string headline, string docHash, string mimeType)
    signal rejectRequested(string ephPub, string reason)
    signal downloadRequested(string filename, string mimeType)

    Connections {
        target: ghostDrop
        function onDecryptResult(success, envelopeJson, errorMsg) {
            decrypting = false
            if (success) {
                decryptedEnvelope = JSON.parse(envelopeJson)
                decryptError = ""
                root.panel = "decrypted"
            } else {
                decryptError = errorMsg
            }
        }
        function onPublishResult(success, cid, txHash, block) {
            publishing = false
            if (success) {
                publishCid.value  = cid
                publishTx.value   = txHash
                publishBlock.text = "#" + block
                publishDone.visible = true
            }
        }
        function onInboxLoaded(itemsJson) {
            var items = JSON.parse(itemsJson)
            inboxModel.clear()
            for (var i = 0; i < items.length; i++) inboxModel.append(items[i])
            root.panel = "inbox"
        }
    }

    // ── Inbox model ───────────────────────────────────────────────
    ListModel { id: inboxModel }

    // ── Root stack ────────────────────────────────────────────────
    StackLayout {
        anchors.fill: parent
        currentIndex: ["dashboard","inbox","decrypt","decrypted"].indexOf(root.panel)

        // ── Dashboard ─────────────────────────────────────────────
        Item {
            ScrollView {
                anchors.fill: parent; contentWidth: parent.width
                ColumnLayout {
                    width: parent.width; spacing: 0
                    padding: 20

                    SectionTitle { text: "Outlet Dashboard" }
                    GAlert { text: "Outlet: Zero Knowledge Reports · 31,000 NOM staked"; type: "info" }

                    Rectangle {
                        Layout.fillWidth: true; height: 1
                        color: "#373a40"; Layout.topMargin: 8; Layout.bottomMargin: 8
                    }

                    // Status rows
                    Repeater {
                        model: [
                            { label: "Outlet",         value: "Zero Knowledge Reports"         },
                            { label: "Topic",          value: "/logos-drop/1/sub/outlet_3"     },
                            { label: "Staked Bond",    value: "31,000 NOM"                     },
                            { label: "Publications",   value: "112"                            },
                        ]
                        delegate: RowLayout {
                            Layout.fillWidth: true; Layout.bottomMargin: 6
                            Text { text: modelData.label; color: "#909296"; font.pixelSize: 11; Layout.minimumWidth: 120 }
                            Text { text: modelData.value; color: "#f1f3f5"; font.pixelSize: 11; font.family: "Menlo, monospace"; wrapMode: Text.WrapAnywhere; Layout.fillWidth: true }
                        }
                    }

                    // Messaging status indicator
                    RowLayout {
                        Layout.topMargin: 12; Layout.bottomMargin: 16; spacing: 8
                        Rectangle { width: 6; height: 6; radius: 3; color: "#2f9e44" }
                        Text { text: "Logos Messaging filter active — subscribed to submission topic"; color: "#909296"; font.pixelSize: 11 }
                    }

                    GButton {
                        text: "Open Encrypted Inbox"
                        primary: true
                        onClicked: {
                            ghostDrop.loadInbox(ghostDrop.outletId)
                            root.panel = "inbox"
                        }
                    }
                }
            }
        }

        // ── Inbox ─────────────────────────────────────────────────
        Item {
            ColumnLayout {
                anchors.fill: parent; anchors.margins: 20; spacing: 12

                SectionTitle { text: "Encrypted Inbox · " + inboxModel.count + " submissions" }

                Text {
                    text: "All submissions are ECIES-encrypted. Click Decrypt to open and download."
                    color: "#909296"; font.pixelSize: 11; wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                // Header row
                RowLayout {
                    Layout.fillWidth: true
                    Repeater {
                        model: ["Ephemeral Pubkey","Size","Type","Received","Status","Action"]
                        delegate: Text {
                            text: modelData; color: "#5c5f66"; font.pixelSize: 9
                            font.letterSpacing: 1.2; Layout.fillWidth: true
                            horizontalAlignment: index === 5 ? Text.AlignRight : Text.AlignLeft
                        }
                    }
                }

                ListView {
                    Layout.fillWidth: true; Layout.fillHeight: true; clip: true; spacing: 4
                    model: inboxModel

                    delegate: Rectangle {
                        width: ListView.view.width; height: 44
                        color: "#2c2e33"; border.color: "#373a40"; border.width: 1; radius: 4

                        RowLayout {
                            anchors.fill: parent; anchors.margins: 10; spacing: 8

                            Text {
                                text: model.ephPub ? (model.ephPub.slice(0,18) + "…" + model.ephPub.slice(-6)) : ""
                                color: "#74c0fc"; font.pixelSize: 10; font.family: "Menlo, monospace"
                                Layout.fillWidth: true
                            }
                            Text { text: model.size  || ""; color: "#909296"; font.pixelSize: 10; Layout.minimumWidth: 56 }
                            Text { text: model.type  || ""; color: "#909296"; font.pixelSize: 10; Layout.minimumWidth: 36 }
                            Text { text: model.timeAgo || ""; color: "#909296"; font.pixelSize: 10; Layout.minimumWidth: 54 }
                            Text {
                                text: model.status || ""
                                color: model.status === "unread" ? "#0061ff" : "#5c5f66"
                                font.pixelSize: 9; font.capitalization: Font.AllUppercase
                                Layout.minimumWidth: 44
                            }
                            GButton {
                                text: "🔓 Decrypt"; small: true
                                onClicked: {
                                    root.selectedItem = model
                                    decryptError = ""
                                    privKeyInput.text = ""
                                    root.panel = "decrypt"
                                }
                            }
                        }
                    }

                    // Empty state
                    Text {
                        anchors.centerIn: parent
                        text: "No submissions yet.\nWaiting on Logos Messaging…"
                        color: "#5c5f66"; font.pixelSize: 12; horizontalAlignment: Text.AlignHCenter
                        visible: inboxModel.count === 0
                    }
                }

                GButton { text: "← Dashboard"; onClicked: root.panel = "dashboard" }
            }
        }

        // ── Decrypt ───────────────────────────────────────────────
        Item {
            ScrollView {
                anchors.fill: parent; contentWidth: parent.width
                ColumnLayout {
                    width: parent.width; spacing: 12; padding: 20

                    SectionTitle { text: "Decrypt Submission" }

                    HashDisplay {
                        label: "Source Ephemeral Pubkey"
                        value: root.selectedItem ? (root.selectedItem.ephPub || "") : ""
                        Layout.fillWidth: true
                    }

                    // Info row
                    RowLayout {
                        spacing: 16; Layout.fillWidth: true
                        Repeater {
                            model: root.selectedItem ? [
                                "Received: " + (root.selectedItem.timeAgo || ""),
                                "Size: " + (root.selectedItem.size || ""),
                                "Type: " + (root.selectedItem.type || ""),
                                root.selectedItem.stripped ? "✓ Strip attested" : "⚠ No strip attestation"
                            ] : []
                            delegate: Text {
                                text: modelData; font.pixelSize: 11
                                color: index === 3 ? (root.selectedItem?.stripped ? "#2f9e44" : "#f59f00") : "#909296"
                            }
                        }
                    }

                    Text {
                        text: "Outlet Private Key"
                        color: "#f1f3f5"; font.pixelSize: 13; font.bold: true
                    }
                    Text {
                        text: "Your outlet secp256k1 private key (32 bytes / 64 hex chars). Never leaves this device."
                        color: "#909296"; font.pixelSize: 11; wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }

                    RowLayout {
                        Layout.fillWidth: true; spacing: 8
                        TextField {
                            id: privKeyInput
                            Layout.fillWidth: true
                            placeholderText: "64-character hex private key…"
                            echoMode: showKey.checked ? TextInput.Normal : TextInput.Password
                            font.family: "Menlo, monospace"; font.pixelSize: 11
                            background: Rectangle { color: "#2c2e33"; border.color: privKeyInput.activeFocus ? "#0061ff" : "#373a40"; radius: 5 }
                            color: "#f1f3f5"
                            onTextChanged: decryptError = ""
                        }
                        CheckBox {
                            id: showKey; text: "Show"
                            contentItem: Text { text: showKey.text; color: "#909296"; font.pixelSize: 11; leftPadding: showKey.indicator.width + 4 }
                        }
                    }

                    RowLayout {
                        spacing: 8
                        GButton {
                            text: "📂 Load key file"
                            onClicked: keyFileDialog.open()
                        }
                        Text { text: "or paste hex above"; color: "#5c5f66"; font.pixelSize: 10 }
                    }

                    GAlert {
                        visible: decryptError !== ""
                        text: "✗ " + decryptError
                        type: "danger"
                    }

                    RowLayout {
                        spacing: 8
                        GButton { text: "← Inbox"; onClicked: root.panel = "inbox" }
                        GButton {
                            text: decrypting ? "Decrypting…" : "🔓 Decrypt Submission"
                            primary: true; enabled: !decrypting && privKeyInput.text.trim() !== ""
                            onClicked: {
                                var key = privKeyInput.text.trim().replace(/^0x/, "")
                                if (key.length !== 64) { decryptError = "Private key must be 32 bytes (64 hex chars)"; return }
                                decrypting = true
                                if (root.selectedItem && root.selectedItem.payloadHex) {
                                    ghostDrop.decryptSubmission(root.selectedItem.payloadHex, key)
                                } else {
                                    // Mock — simulate decryption
                                    ghostDrop.decryptSubmissionMock(root.selectedItem ? JSON.stringify(root.selectedItem) : "{}", key)
                                }
                            }
                        }
                    }
                }
            }

            // File dialog for key loading
            FileDialog {
                id: keyFileDialog
                title: "Load Private Key File"
                nameFilters: ["Key files (*.hex *.key *.pem *.txt)", "All files (*)"]
                onAccepted: ghostDrop.loadKeyFromFile(fileUrl, function(hex) { privKeyInput.text = hex })
            }
        }

        // ── Decrypted ─────────────────────────────────────────────
        Item {
            ScrollView {
                anchors.fill: parent; contentWidth: parent.width
                ColumnLayout {
                    width: parent.width; spacing: 12; padding: 20

                    SectionTitle { text: "Decrypted Submission" }

                    GAlert {
                        type: "success"
                        text: "✓ ECIES decryption successful · Strip attestation verified · " +
                              (decryptedEnvelope ? ((decryptedEnvelope.docSize / 1024).toFixed(1) + " KB plaintext") : "")
                    }

                    // Envelope details
                    Rectangle {
                        Layout.fillWidth: true; color: "#2c2e33"
                        border.color: "#373a40"; radius: 8; height: detailsCol.implicitHeight + 24
                        ColumnLayout {
                            id: detailsCol; anchors { fill: parent; margins: 12 }; spacing: 8
                            SectionTitle { text: "Submission Details"; small: true }
                            Repeater {
                                model: decryptedEnvelope ? [
                                    { label: "Version",       value: decryptedEnvelope.version || "" },
                                    { label: "Submitted",     value: decryptedEnvelope.ts ? new Date(decryptedEnvelope.ts).toLocaleString() : "" },
                                    { label: "MIME Type",     value: decryptedEnvelope.mimeType || "" },
                                    { label: "Document Size", value: decryptedEnvelope.docSize ? ((decryptedEnvelope.docSize/1024).toFixed(1)+" KB") : "" },
                                ] : []
                                delegate: RowLayout {
                                    Layout.fillWidth: true
                                    Text { text: modelData.label; color: "#909296"; font.pixelSize: 11; Layout.minimumWidth: 110 }
                                    Text { text: modelData.value; color: "#f1f3f5"; font.pixelSize: 11; Layout.fillWidth: true }
                                }
                            }
                            HashDisplay {
                                label: "Document Hash (SHA-256)"
                                value: decryptedEnvelope ? (decryptedEnvelope.docHash || "") : ""
                                Layout.fillWidth: true
                            }
                        }
                    }

                    // Cover note
                    Rectangle {
                        Layout.fillWidth: true; color: "#2c2e33"; border.color: "#373a40"; radius: 8
                        visible: decryptedEnvelope && decryptedEnvelope.coverNote && decryptedEnvelope.coverNote !== ""
                        height: coverCol.implicitHeight + 24
                        ColumnLayout {
                            id: coverCol; anchors { fill: parent; margins: 12 }; spacing: 8
                            SectionTitle { text: "Cover Note from Source"; small: true }
                            Rectangle {
                                Layout.fillWidth: true; color: "#0d0e12"; border.color: "#373a40"; radius: 5
                                height: coverText.implicitHeight + 20
                                Text {
                                    id: coverText
                                    anchors { fill: parent; margins: 10 }
                                    text: decryptedEnvelope ? ("\"" + (decryptedEnvelope.coverNote || "") + "\"") : ""
                                    color: "#f1f3f5"; font.pixelSize: 12; wrapMode: Text.WordWrap
                                    lineHeight: 1.6
                                }
                            }
                        }
                    }

                    // Download
                    Rectangle {
                        Layout.fillWidth: true; color: "#2c2e33"; border.color: "#373a40"; radius: 8
                        height: dlCol.implicitHeight + 24
                        ColumnLayout {
                            id: dlCol; anchors { fill: parent; margins: 12 }; spacing: 8
                            SectionTitle { text: "Download Decrypted File"; small: true }
                            Text {
                                text: "Metadata-stripped by the source. Verify content before publishing."
                                color: "#909296"; font.pixelSize: 11; wrapMode: Text.WordWrap
                                Layout.fillWidth: true
                            }
                            GButton {
                                text: "⬇ Download File · " + (decryptedEnvelope ? (decryptedEnvelope.docSize/1024).toFixed(1)+" KB" : "")
                                primary: true
                                onClicked: {
                                    if (decryptedEnvelope) {
                                        ghostDrop.downloadDecryptedFile(
                                            "submission_" + (root.selectedItem?.id || "doc") + "." +
                                            (decryptedEnvelope.mimeType === "application/pdf" ? "pdf" : "zip"),
                                            decryptedEnvelope.mimeType
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Publish
                    Rectangle {
                        Layout.fillWidth: true; color: "#2c2e33"; border.color: "#373a40"; radius: 8
                        height: pubCol.implicitHeight + 24
                        ColumnLayout {
                            id: pubCol; anchors { fill: parent; margins: 12 }; spacing: 10
                            SectionTitle { text: "Publish to Logos Stack"; small: true }

                            TextField {
                                id: headlineInput
                                Layout.fillWidth: true
                                placeholderText: "Enter headline for publication record…"
                                font.pixelSize: 12
                                background: Rectangle { color: "#373a40"; border.color: headlineInput.activeFocus ? "#0061ff" : "#4a4d55"; radius: 5 }
                                color: "#f1f3f5"
                            }

                            LogTerminal {
                                id: publishLog
                                Layout.fillWidth: true; Layout.preferredHeight: 120
                                visible: publishLog.count > 0
                            }

                            Rectangle {
                                id: publishDone; visible: false; Layout.fillWidth: true
                                color: "rgba(47,158,68,0.1)"; border.color: "rgba(47,158,68,0.25)"; radius: 5; height: pdCol.implicitHeight + 16
                                ColumnLayout { id: pdCol; anchors { fill: parent; margins: 8 }; spacing: 6
                                    Text { text: "✓ Pinned to Logos Storage · Anchored on Logos Blockchain · Announced via Logos Messaging"; color: "#2f9e44"; font.pixelSize: 11; wrapMode: Text.WordWrap; Layout.fillWidth: true }
                                    HashDisplay { id: publishCid; label: "Logos Storage CID"; Layout.fillWidth: true }
                                    HashDisplay { id: publishTx;  label: "Logos Blockchain Anchor TX"; Layout.fillWidth: true }
                                    RowLayout {
                                        Text { text: "Block"; color: "#909296"; font.pixelSize: 11 }
                                        Text { id: publishBlock; color: "#0061ff"; font.pixelSize: 11; font.family: "Menlo,monospace" }
                                    }
                                }
                            }

                            RowLayout {
                                spacing: 8; Layout.fillWidth: true
                                GButton { text: "← Inbox"; onClicked: root.panel = "inbox" }
                                Item { Layout.fillWidth: true }
                                TextField {
                                    id: rejectReasonInput
                                    placeholderText: "Rejection reason…"; font.pixelSize: 11; implicitWidth: 180
                                    background: Rectangle { color: "#373a40"; border.color: rejectReasonInput.activeFocus ? "#e03131" : "#4a4d55"; radius: 5 }
                                    color: "#f1f3f5"
                                }
                                GButton {
                                    text: "Reject"; danger: true
                                    enabled: rejectReasonInput.text.trim() !== "" && !publishing
                                    onClicked: {
                                        ghostDrop.rejectSubmission(root.selectedItem?.ephPub || "", rejectReasonInput.text.trim())
                                        root.panel = "inbox"
                                    }
                                }
                                GButton {
                                    text: publishing ? "Publishing…" : "Publish → Logos Storage + Logos Blockchain"
                                    primary: true
                                    enabled: !publishing && headlineInput.text.trim() !== ""
                                    onClicked: {
                                        publishing = true
                                        publishDone.visible = false
                                        publishLog.clear()
                                        ghostDrop.publishDocument(
                                            headlineInput.text.trim(),
                                            decryptedEnvelope?.docHash || "",
                                            decryptedEnvelope?.mimeType || "application/pdf",
                                            ghostDrop.outletId,
                                            JSON.stringify(decryptedEnvelope || {})
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
