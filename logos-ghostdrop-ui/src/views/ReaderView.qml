// ReaderView.qml — port of src/views/ReaderView.jsx
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    implicitHeight: content.implicitHeight
    property var colors

    property var    publications: []
    property var    selected: null
    property bool   loading: true
    property string filterTag: ""
    property bool   verifying: false
    property var    verifyResult: null
    property string tipAmount: ""
    property bool   tipping: false
    property var    tipResult: null

    Connections {
        target: ghostDrop
        function onPublicationsLoaded(pubs) {
            root.publications = pubs
            root.loading = false
        }
        function onVerifyResult(nomosOk, codexOk, mock) {
            root.verifyResult = { nomosVerified: nomosOk, codexVerified: codexOk, mock: mock }
            root.verifying = false
        }
        function onTipLocked(txHash, mock) {
            root.tipResult = { txHash: txHash, mock: mock, amount: root.tipAmount }
            root.tipping = false
        }
    }

    Component.onCompleted: ghostDrop.loadPublications()

    // All unique tags from publications
    property var allTags: {
        var tags = []
        for (var i = 0; i < publications.length; i++) {
            var t = publications[i].tags || []
            for (var j = 0; j < t.length; j++) {
                if (tags.indexOf(t[j]) === -1) tags.push(t[j])
            }
        }
        return tags
    }

    property var filteredPubs: {
        if (!root.filterTag) return root.publications
        return root.publications.filter(function(p) {
            return (p.tags || []).indexOf(root.filterTag) >= 0
        })
    }

    Column {
        id: content
        anchors { left: parent.left; right: parent.right }
        spacing: 16

        // Loading
        Row {
            visible: root.loading
            spacing: 10
            BusyIndicator { width: 20; height: 20; running: true }
            Text { text: "Querying Logos Blockchain chain for publication records…"; color: colors.textSecond; font.pixelSize: 13; anchors.verticalCenter: parent.verticalCenter }
        }

        // ── Feed ─────────────────────────────────────────────────
        Item {
            visible: !root.loading && root.selected === null
            width: parent.width
            implicitHeight: visible ? feedCol.implicitHeight : 0

            Column {
                id: feedCol
                width: parent.width
                spacing: 16

                SectionTitle {
                    text: "Published Documents"
                    sub: "Anchored on Logos Blockchain · Stored on Logos Storage · Delivered via Logos Messaging"
                    colors: colors
                }

                // Tag filter
                Row {
                    spacing: 8
                    GButton {
                        label: "All"
                        ghost: root.filterTag !== ""
                        colors: colors
                        onClicked: root.filterTag = ""
                    }
                    Repeater {
                        model: root.allTags
                        delegate: GButton {
                            label: modelData
                            ghost: root.filterTag !== modelData
                            colors: colors
                            onClicked: root.filterTag = modelData
                        }
                    }
                }

                // Publication cards
                Column {
                    width: parent.width
                    spacing: 2

                    Repeater {
                        model: root.filteredPubs
                        delegate: Rectangle {
                            width: feedCol.width
                            implicitHeight: cardCol.implicitHeight + 32
                            color: hov.containsMouse ? colors.surface2 : colors.surface
                            border.color: colors.border
                            radius: colors.radius

                            Column {
                                id: cardCol
                                anchors { fill: parent; margins: 16 }
                                spacing: 10

                                RowLayout {
                                    width: parent.width
                                    Text {
                                        text: modelData.headline
                                        color: colors.textPrimary
                                        font { pixelSize: 14; bold: true }
                                        wrapMode: Text.WordWrap
                                        Layout.fillWidth: true
                                    }
                                    Text { text: "✓ ANCHORED"; color: colors.accent; font.pixelSize: 10 }
                                }

                                Text {
                                    width: parent.width
                                    text: (modelData.summary || "").substring(0, 140) + "…"
                                    color: colors.textSecond; font.pixelSize: 12
                                    wrapMode: Text.WordWrap
                                }

                                RowLayout {
                                    width: parent.width
                                    Row {
                                        spacing: 8
                                        Text { text: modelData.outlet; color: colors.textDim; font.pixelSize: 12 }
                                        Repeater {
                                            model: modelData.tags || []
                                            delegate: Rectangle {
                                                height: 18; width: tagTxt.width + 10; radius: 3
                                                color: colors.surface2
                                                Text { id: tagTxt; anchors.centerIn: parent; text: modelData; color: colors.textDim; font.pixelSize: 10 }
                                            }
                                        }
                                    }
                                    Item { Layout.fillWidth: true }
                                    Column {
                                        horizontalItemAlignment: Qt.AlignRight
                                        spacing: 2
                                        Text { text: "tip pool: " + modelData.tipPool; color: colors.accent; font.pixelSize: 12 }
                                        Text { text: ghostDrop.fmtAgo(modelData.ts); color: colors.textDim; font.pixelSize: 11 }
                                    }
                                }
                            }

                            HoverHandler { id: hov }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: {
                                    root.selected = modelData
                                    root.verifyResult = null
                                    root.tipResult = null
                                    root.tipAmount = ""
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Document detail ───────────────────────────────────────
        Item {
            visible: !root.loading && root.selected !== null
            width: parent.width
            implicitHeight: visible ? detailCol.implicitHeight : 0

            Column {
                id: detailCol
                width: parent.width
                spacing: 16

                GButton { label: "← All Documents"; ghost: true; colors: colors; onClicked: { root.selected = null; root.verifyResult = null } }

                Text {
                    text: root.selected ? root.selected.headline : ""
                    color: colors.textPrimary; font { pixelSize: 17; bold: true }
                    wrapMode: Text.WordWrap; width: parent.width
                }
                Row {
                    spacing: 10
                    Text { text: root.selected ? root.selected.outlet : "";                color: colors.textSecond; font.pixelSize: 13 }
                    Text { text: "·";                                                        color: colors.textDim;   font.pixelSize: 13 }
                    Text { text: root.selected ? ghostDrop.fmtAgo(root.selected.ts) : "";  color: colors.textDim;   font.pixelSize: 13 }
                }

                // Summary
                Rectangle {
                    width: parent.width
                    color: colors.surface; border.color: colors.border; radius: colors.radius
                    padding: 20
                    implicitHeight: summaryText.implicitHeight + 40
                    Text {
                        id: summaryText
                        anchors { left: parent.left; right: parent.right; top: parent.top; margins: 20 }
                        text: root.selected ? root.selected.summary : ""
                        color: colors.textSecond; font.pixelSize: 13
                        wrapMode: Text.WordWrap; lineHeight: 1.7
                    }
                }

                // Verification panel
                Rectangle {
                    width: parent.width
                    color: colors.surface; border.color: colors.border; radius: colors.radius
                    padding: 20
                    implicitHeight: verCol.implicitHeight + 40

                    Column {
                        id: verCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 12

                        Text { text: "Two-Layer Verification"; color: colors.textPrimary; font { pixelSize: 15; bold: true } }
                        Text { text: "Verifies (1) the Logos Blockchain anchor and (2) the Logos Storage content hash independently."; color: colors.textSecond; font.pixelSize: 13; wrapMode: Text.WordWrap; width: parent.width }

                        HashDisplay { label: "Document Hash (SHA-256)"; value: root.selected ? root.selected.hash : ""; colors: colors; width: parent.width }
                        HashDisplay { label: "Logos Storage CID"; value: root.selected ? root.selected.cid : ""; colors: colors; width: parent.width }
                        HashDisplay { label: "Logos Blockchain Transaction"; value: root.selected ? root.selected.txHash : ""; colors: colors; width: parent.width }

                        Rectangle {
                            width: parent.width; height: 36
                            color: colors.surface2; radius: colors.radiusSm
                            RowLayout {
                                anchors { fill: parent; leftMargin: 12; rightMargin: 12 }
                                Text { text: "Anchored at Block"; color: colors.textSecond; font.pixelSize: 12 }
                                Item { Layout.fillWidth: true }
                                Text { text: root.selected ? "#" + (root.selected.block || 0).toLocaleString() : ""; color: colors.textPrimary; font.pixelSize: 12 }
                            }
                        }

                        GButton {
                            visible: root.verifyResult === null
                            label: root.verifying ? "Verifying Logos Blockchain + Logos Storage…" : "Verify Document Integrity"
                            enabled: !root.verifying; colors: colors
                            onClicked: {
                                root.verifying = true
                                ghostDrop.verifyDocument(root.selected.txHash, root.selected.cid, root.selected.hash)
                            }
                        }

                        Column {
                            visible: root.verifyResult !== null
                            width: parent.width
                            spacing: 6
                            GAlert {
                                type: root.verifyResult && root.verifyResult.nomosVerified ? "success" : "danger"
                                text: root.verifyResult
                                    ? (root.verifyResult.nomosVerified ? "✓" : "✗") + " Logos Blockchain anchor"
                                      + (root.verifyResult.mock ? " (mock)" : " verified")
                                    : ""
                                colors: colors; width: parent.width
                            }
                            GAlert {
                                type: root.verifyResult && root.verifyResult.codexVerified ? "success" : "danger"
                                text: root.verifyResult
                                    ? (root.verifyResult.codexVerified ? "✓" : "✗") + " Logos Storage content hash"
                                      + (root.verifyResult.mock ? " (manifest only)" : " — document unmodified")
                                    : ""
                                colors: colors; width: parent.width
                            }
                        }
                    }
                }

                // Tip panel
                Rectangle {
                    width: parent.width
                    color: colors.surface; border.color: colors.border; radius: colors.radius
                    padding: 20
                    implicitHeight: tipCol.implicitHeight + 40

                    Column {
                        id: tipCol
                        width: parent.width - 40
                        anchors.centerIn: parent
                        spacing: 12

                        Text { text: "Tip the Source"; color: colors.textPrimary; font { pixelSize: 15; bold: true } }
                        Text {
                            width: parent.width
                            text: "Tips are locked as UTXO outputs on Logos Blockchain, keyed to the source's ephemeral pubkey. Only the holder of the matching private key can spend them."
                            color: colors.textSecond; font.pixelSize: 13; wrapMode: Text.WordWrap
                        }
                        Rectangle {
                            width: parent.width; height: 36
                            color: colors.surface2; radius: colors.radiusSm
                            RowLayout {
                                anchors { fill: parent; leftMargin: 12; rightMargin: 12 }
                                Text { text: "Current tip pool"; color: colors.textSecond; font.pixelSize: 12 }
                                Item { Layout.fillWidth: true }
                                Text { text: root.selected ? root.selected.tipPool : ""; color: colors.accent; font { pixelSize: 12; bold: true } }
                            }
                        }

                        Row {
                            visible: root.tipResult === null
                            spacing: 10
                            TextField {
                                width: 140
                                placeholderText: "0.00"
                                color: colors.textPrimary
                                background: Rectangle { color: colors.surface; border.color: colors.border; radius: colors.radiusSm }
                                inputMethodHints: Qt.ImhFormattedNumbersOnly
                                onTextChanged: root.tipAmount = text
                            }
                            Text { text: "XMR"; color: colors.textDim; font.pixelSize: 13; anchors.verticalCenter: parent.verticalCenter }
                            GButton {
                                label: root.tipping ? "Locking…" : "Lock in Logos Blockchain Escrow"
                                enabled: !root.tipping && root.tipAmount !== ""
                                colors: colors
                                onClicked: {
                                    root.tipping = true
                                    ghostDrop.lockTip(root.selected.id, root.selected.id, parseFloat(root.tipAmount))
                                }
                            }
                        }

                        Column {
                            visible: root.tipResult !== null
                            width: parent.width
                            spacing: 10
                            GAlert {
                                type: "success"
                                text: root.tipResult
                                    ? ("✓ " + root.tipAmount + " XMR locked in Logos Blockchain escrow"
                                       + (root.tipResult.mock ? " (mock)" : "")
                                       + ". Source claims anonymously with 12-word key.")
                                    : ""
                                colors: colors; width: parent.width
                            }
                            HashDisplay { label: "Escrow Transaction"; value: root.tipResult ? root.tipResult.txHash : ""; colors: colors; width: parent.width }
                        }
                    }
                }
            }
        }
    }
}
