// GhostDropBridge.cpp
#include "GhostDropBridge.h"
#include "logos_api.h"
#include "logos_api_client.h"

#include <QFile>
#include <QMimeDatabase>
#include <QGuiApplication>
#include <QClipboard>
#include <QDateTime>
#include <QDebug>

GhostDropBridge::GhostDropBridge(LogosAPI *logosAPI, QObject *parent)
    : QObject(parent)
    , m_logosAPI(logosAPI)
{
    // Check node status on startup
    QTimer::singleShot(2000, this, &GhostDropBridge::checkNodeStatus);
}

// ─── Event router ─────────────────────────────────────────────────

void GhostDropBridge::handleEvent(const QString &eventName, const QVariantList &data)
{
    qDebug() << "GhostDropBridge: event" << eventName;

    if (eventName == "stripProgress" && data.size() >= 2)
        emit stripProgress(data[0].toString(), data[1].toInt());

    else if (eventName == "stripComplete" && data.size() >= 2)
        emit stripComplete(data[0].toMap(), data[1].toString());

    else if (eventName == "stripError" && data.size() >= 1)
        emit stripError(data[0].toString());

    else if (eventName == "outletsLoaded" && data.size() >= 1)
        emit outletsLoaded(data[0].toList());

    else if (eventName == "submitLog" && data.size() >= 2)
        emit submitLog(data[0].toString(), data[1].toString());

    else if (eventName == "submitComplete" && data.size() >= 1)
        emit submitComplete(data[0].toMap());

    else if (eventName == "submitError" && data.size() >= 1)
        emit submitError(data[0].toString());

    else if (eventName == "backChannelMessages" && data.size() >= 1)
        emit backChannelMessages(data[0].toList());

    else if (eventName == "inboxLoaded" && data.size() >= 1)
        emit inboxLoaded(data[0].toList());

    else if (eventName == "publishLog" && data.size() >= 2)
        emit publishLog(data[0].toString(), data[1].toString());

    else if (eventName == "publishComplete" && data.size() >= 1)
        emit publishComplete(data[0].toMap());

    else if (eventName == "publishError" && data.size() >= 1)
        emit publishError(data[0].toString());

    else if (eventName == "publicationsLoaded" && data.size() >= 1)
        emit publicationsLoaded(data[0].toList());

    else if (eventName == "verifyResult" && data.size() >= 3)
        emit verifyResult(data[0].toBool(), data[1].toBool(), data[2].toBool());

    else if (eventName == "tipLocked" && data.size() >= 2)
        emit tipLocked(data[0].toString(), data[1].toBool());

    else if (eventName == "nodeStatus" && data.size() >= 3) {
        m_storageStatus = data[0].toBool() ? "active" : "warn";
        m_blockchainStatus = data[1].toBool() ? "active" : "warn";
        m_messagingStatus  = m_logosAPI ? "active" : "warn";
        emit statusChanged();
    }
}

// ─── File handling ────────────────────────────────────────────────

void GhostDropBridge::readFileFromPath(const QString &path)
{
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) {
        qWarning() << "GhostDropBridge: cannot open" << path;
        return;
    }
    QByteArray data = f.readAll();
    f.close();

    QMimeDatabase db;
    QString mime = db.mimeTypeForFile(path).name();
    QString fileName = path.split("/").last();

    emit fileRead(data.toHex(), mime, fileName);
}

QString GhostDropBridge::stringToHex(const QString &text)
{
    return text.toUtf8().toHex();
}

// ─── Source flow ──────────────────────────────────────────────────

QVariantMap GhostDropBridge::scanFile(const QString &fileDataHex,
                                       const QString &mimeType)
{
    // Synchronous scan — call backend directly if available,
    // otherwise do a quick local scan
    if (m_logosAPI) {
        // Blocking call via LogosAPI
        auto result = m_logosAPI->getClient(kModule)
            ->callMethodSync("scanFile", { fileDataHex, mimeType });
        return result.toMap();
    }
    // Fallback: return empty scan result
    return QVariantMap{ {"fields", QVariantList{}}, {"hasGPS", false}, {"hasPrinterDots", false} };
}

void GhostDropBridge::stripFile(const QString &fileDataHex,
                                 const QString &mimeType,
                                 const QString &filename)
{
    callBackend("stripFile", { fileDataHex, mimeType, filename });
}

void GhostDropBridge::loadOutlets()
{
    callBackend("loadOutlets");
}

void GhostDropBridge::submitDocument(const QString &fileDataHex,
                                      const QString &mimeType,
                                      const QString &outletId,
                                      const QString &outletPubKeyHex,
                                      const QString &outletTopic,
                                      const QString &coverNote,
                                      const QVariantMap &stripReport)
{
    callBackend("submitDocument", {
        fileDataHex, mimeType, outletId,
        outletPubKeyHex, outletTopic, coverNote, stripReport
    });
}

void GhostDropBridge::pollBackChannel(const QString &ephPubHex)
{
    callBackend("pollBackChannel", { ephPubHex });
}

// ─── Outlet flow ──────────────────────────────────────────────────

void GhostDropBridge::loadInbox(const QString &outletId)
{
    callBackend("loadInbox", { outletId });
}

void GhostDropBridge::publishDocument(const QString &headline,
                                       const QString &docDataHex,
                                       const QString &mimeType,
                                       const QString &outletId,
                                       const QVariantMap &meta)
{
    callBackend("publishDocument", { headline, docDataHex, mimeType, outletId, meta });
}

void GhostDropBridge::rejectSubmission(const QString &ephPubHex,
                                        const QString &outletId,
                                        const QString &reason)
{
    callBackend("rejectSubmission", { ephPubHex, outletId, reason });
}

// ─── Reader flow ──────────────────────────────────────────────────

void GhostDropBridge::loadPublications()
{
    callBackend("loadPublications");
}

void GhostDropBridge::verifyDocument(const QString &txHash,
                                      const QString &cid,
                                      const QString &expectedHash)
{
    callBackend("verifyDocument", { txHash, cid, expectedHash });
}

void GhostDropBridge::lockTip(const QString &anchorId,
                               const QString &ephPubHex,
                               double amount)
{
    callBackend("lockTip", { anchorId, ephPubHex, amount });
}

// ─── Utilities ────────────────────────────────────────────────────

void GhostDropBridge::copyToClipboard(const QString &text)
{
    QGuiApplication::clipboard()->setText(text);
}

QString GhostDropBridge::fmtAgo(qint64 timestamp)
{
    qint64 s = (QDateTime::currentMSecsSinceEpoch() - timestamp) / 1000;
    if (s < 3600)  return QString::number(s / 60) + "m ago";
    if (s < 86400) return QString::number(s / 3600) + "h ago";
    return QString::number(s / 86400) + "d ago";
}

void GhostDropBridge::checkNodeStatus()
{
    callBackend("checkNodeStatus");
}

// ─── Private ─────────────────────────────────────────────────────

void GhostDropBridge::callBackend(const QString &method, const QVariantList &args)
{
    if (!m_logosAPI) {
        qWarning() << "GhostDropBridge: LogosAPI unavailable, cannot call" << method;
        return;
    }
    m_logosAPI->getClient(kModule)->callMethod(method, args);
}
