// GhostDropBridge.cpp
#include "GhostDropBridge.h"
#include "logos_api.h"
#include "logos_api_client.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDateTime>
#include <QFile>
#include <QDir>
#include <QStandardPaths>
#include <QDebug>
#include <QJSEngine>

GhostDropBridge::GhostDropBridge(LogosAPI *logosAPI, QObject *parent)
    : QObject(parent), m_logosAPI(logosAPI)
{}

void GhostDropBridge::handleEvent(const QString &eventName, const QVariantList &data)
{
    qDebug() << "GhostDropBridge::handleEvent" << eventName;

    if (eventName == "strip_progress") {
        emit stripProgress(data.value(0).toString(), data.value(1).toInt());
    } else if (eventName == "strip_complete") {
        emit stripComplete(data.value(0).toMap(), data.value(1).toString());
    } else if (eventName == "strip_error") {
        emit stripError(data.value(0).toString());
    } else if (eventName == "outlets_loaded") {
        emit outletsLoaded(data.value(0).toList());
    } else if (eventName == "submit_log") {
        emit submitLog(data.value(0).toString(), data.value(1).toString());
    } else if (eventName == "submit_complete") {
        emit submitComplete(data.value(0).toMap());
    } else if (eventName == "submit_error") {
        emit submitError(data.value(0).toString());
    } else if (eventName == "inbox_loaded") {
        emit inboxLoaded(data.value(0).toString());
    } else if (eventName == "decrypt_result") {
        bool ok = data.value(0).toBool();
        QString envelopeJson = data.value(1).toString();
        QString errorMsg = data.value(2).toString();
        // Cache decrypted bytes from backend
        if (ok) {
            m_lastDecryptedBytes = QByteArray::fromHex(data.value(3).toString().toUtf8());
            m_lastDecryptedMime  = data.value(4).toString();
        }
        emit decryptResult(ok, envelopeJson, errorMsg);
    } else if (eventName == "publish_log") {
        emit publishLog(data.value(0).toString(), data.value(1).toString());
    } else if (eventName == "publish_result") {
        emit publishResult(data.value(0).toBool(), data.value(1).toString(),
                           data.value(2).toString(), data.value(3).toInt());
    } else if (eventName == "publish_error") {
        emit publishError(data.value(0).toString());
    } else if (eventName == "publications_loaded") {
        emit publicationsLoaded(data.value(0).toList());
    } else if (eventName == "verify_result") {
        emit verifyResult(data.value(0).toBool(), data.value(1).toBool(), data.value(2).toBool());
    } else if (eventName == "tip_locked") {
        emit tipLocked(data.value(0).toString(), data.value(1).toBool());
    } else if (eventName == "node_status") {
        m_messagingStatus  = data.value(0).toString();
        m_storageStatus    = data.value(1).toString();
        m_blockchainStatus = data.value(2).toString();
        emit statusChanged();
    } else if (eventName == "back_channel_messages") {
        emit backChannelMessages(data.value(0).toList());
    } else if (eventName == "file_read") {
        emit fileRead(data.value(0).toString(), data.value(1).toString(), data.value(2).toString());
    }
}

void GhostDropBridge::callBackend(const QString &method, const QVariantList &args)
{
    if (!m_logosAPI) { qWarning() << "GhostDropBridge: no LogosAPI"; return; }
    m_logosAPI->getClient(kModule)->call(method, args);
}

// ── File handling ──────────────────────────────────────────────────

void GhostDropBridge::readFileFromPath(const QString &path)
{
    callBackend("readFile", { path });
}

QString GhostDropBridge::stringToHex(const QString &text)
{
    return text.toUtf8().toHex();
}

// ── Source flow ────────────────────────────────────────────────────

QVariantMap GhostDropBridge::scanFile(const QString &fileDataHex, const QString &mimeType)
{
    callBackend("scanFile", { fileDataHex, mimeType });
    return {};
}

void GhostDropBridge::stripFile(const QString &fileDataHex, const QString &mimeType, const QString &filename)
{
    callBackend("stripFile", { fileDataHex, mimeType, filename });
}

void GhostDropBridge::loadOutlets()
{
    callBackend("loadOutlets");
}

void GhostDropBridge::submitDocument(const QString &fileDataHex, const QString &mimeType,
                                      const QString &outletId, const QString &outletPubKeyHex,
                                      const QString &outletTopic, const QString &coverNote,
                                      const QVariantMap &stripReport)
{
    callBackend("submitDocument", { fileDataHex, mimeType, outletId, outletPubKeyHex, outletTopic, coverNote, stripReport });
}

void GhostDropBridge::pollBackChannel(const QString &ephPubHex)
{
    callBackend("pollBackChannel", { ephPubHex });
}

// ── Outlet: Inbox ──────────────────────────────────────────────────

void GhostDropBridge::loadInbox(const QString &outletId)
{
    callBackend("loadInbox", { outletId });
}

// ── Outlet: Decrypt ────────────────────────────────────────────────

void GhostDropBridge::decryptSubmission(const QString &payloadHex, const QString &privKeyHex)
{
    callBackend("decryptSubmission", { payloadHex, privKeyHex });
}

void GhostDropBridge::decryptSubmissionMock(const QString &itemJson, const QString &privKeyHex)
{
    // Simulate decryption client-side for mock inbox items
    Q_UNUSED(privKeyHex)

    QJsonDocument doc = QJsonDocument::fromJson(itemJson.toUtf8());
    QJsonObject item = doc.object();
    QString type = item.value("type").toString();

    QJsonObject envelope;
    envelope["version"]   = "logos-drop/1";
    envelope["ts"]        = QDateTime::currentMSecsSinceEpoch() - 7200000;
    envelope["docHash"]   = "sha256:3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b";
    envelope["docSize"]   = 2457600;
    envelope["mimeType"]  = (type == "PDF") ? "application/pdf" : "application/zip";
    envelope["ephPubHex"] = item.value("ephPub").toString();
    envelope["coverNote"] = "I work in the compliance department. These records show systematic falsification of environmental monitoring reports over 4 years. My identity must be protected.";

    // Generate mock file bytes
    m_lastDecryptedBytes = QByteArray(512, 0);
    for (int i = 0; i < m_lastDecryptedBytes.size(); ++i)
        m_lastDecryptedBytes[i] = static_cast<char>(i % 256);
    m_lastDecryptedMime = envelope["mimeType"].toString();

    QString envelopeJson = QString::fromUtf8(QJsonDocument(envelope).toJson(QJsonDocument::Compact));
    emit decryptResult(true, envelopeJson, QString());
}

void GhostDropBridge::loadKeyFromFile(const QUrl &fileUrl, const QJSValue &callback)
{
    QFile file(fileUrl.toLocalFile());
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        qWarning() << "GhostDropBridge: cannot open key file" << fileUrl;
        return;
    }
    QString content = QString::fromUtf8(file.readAll()).trimmed();
    // Strip PEM headers if present
    content.remove(QRegularExpression("-----.*?-----")).remove(QRegularExpression("\\s"));
    if (callback.isCallable()) {
        QJSValue cb = callback;
        cb.call(QJSValueList{ content });
    }
}

void GhostDropBridge::downloadDecryptedFile(const QString &filename, const QString &mimeType)
{
    if (m_lastDecryptedBytes.isEmpty()) {
        emit downloadError("No decrypted data available");
        return;
    }

    // Save to Downloads folder
    QString downloads = QStandardPaths::writableLocation(QStandardPaths::DownloadLocation);
    QString path = downloads + "/" + filename;

    // Avoid overwriting — append counter if needed
    if (QFile::exists(path)) {
        QFileInfo fi(path);
        int n = 1;
        do {
            path = downloads + "/" + fi.baseName() + "_" + QString::number(n++) + "." + fi.completeSuffix();
        } while (QFile::exists(path));
    }

    QFile file(path);
    if (!file.open(QIODevice::WriteOnly)) {
        emit downloadError("Cannot write to Downloads: " + file.errorString());
        return;
    }
    file.write(m_lastDecryptedBytes);
    file.close();

    qDebug() << "GhostDropBridge: downloaded to" << path;
    emit downloadComplete(path);
}

// ── Outlet: Publish / Reject ───────────────────────────────────────

void GhostDropBridge::publishDocument(const QString &headline, const QString &docHash,
                                       const QString &mimeType, const QString &outletId,
                                       const QString &envelopeJson)
{
    callBackend("publishDocument", { headline, docHash, mimeType, outletId, envelopeJson });
}

void GhostDropBridge::rejectSubmission(const QString &ephPubHex, const QString &reason)
{
    callBackend("rejectSubmission", { ephPubHex, reason });
}

// ── Reader flow ────────────────────────────────────────────────────

void GhostDropBridge::loadPublications()
{
    callBackend("loadPublications");
}

void GhostDropBridge::verifyDocument(const QString &txHash, const QString &cid, const QString &expectedHash)
{
    callBackend("verifyDocument", { txHash, cid, expectedHash });
}

void GhostDropBridge::lockTip(const QString &anchorId, const QString &ephPubHex, double amount)
{
    callBackend("lockTip", { anchorId, ephPubHex, amount });
}

// ── Utilities ──────────────────────────────────────────────────────

void GhostDropBridge::copyToClipboard(const QString &text)
{
    if (QClipboard *cb = QGuiApplication::clipboard())
        cb->setText(text);
}

QString GhostDropBridge::fmtAgo(qint64 timestamp)
{
    qint64 secs = (QDateTime::currentMSecsSinceEpoch() - timestamp) / 1000;
    if (secs < 3600)  return QString::number(secs / 60) + "m ago";
    if (secs < 86400) return QString::number(secs / 3600) + "h ago";
    return QString::number(secs / 86400) + "d ago";
}

void GhostDropBridge::checkNodeStatus()
{
    callBackend("checkNodeStatus");
}
