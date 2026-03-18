// NetworkService.cpp
#include "NetworkService.h"
#include "CryptoService.h"

#include <QNetworkRequest>
#include <QHttpMultiPart>
#include <QHttpPart>
#include <QJsonDocument>
#include <QJsonArray>
#include <QDateTime>
#include <QRandomGenerator>
#include <QTimer>
#include <QDebug>

// sha256("logos-drop-v1") — computed once, matches JS LOGOS_DROP_CHANNEL
const QString LogosBlockchainService::LOGOS_DROP_CHANNEL =
    CryptoService::hashDocument("logos-drop-v1").mid(7); // strip "sha256:"

// ─── LogosStorageService ─────────────────────────────────────────────────

LogosStorageService::LogosStorageService(const QString &nodeUrl, QObject *parent)
    : QObject(parent)
    , m_nam(new QNetworkAccessManager(this))
    , m_nodeUrl(nodeUrl)
{}

void LogosStorageService::checkHealth()
{
    QNetworkRequest req(QUrl(m_nodeUrl + "/api/codex/v1/debug/info"));
    req.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    auto *reply = m_nam->get(req);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        onHealthReply(reply);
    });
}

void LogosStorageService::onHealthReply(QNetworkReply *reply)
{
    reply->deleteLater();
    if (reply->error() != QNetworkReply::NoError) {
        m_online = false;
        emit healthResult(false, {{"error", reply->errorString()}});
        return;
    }
    auto doc = QJsonDocument::fromJson(reply->readAll());
    m_online = true;
    QVariantMap info = doc.object().toVariantMap();
    info["online"] = true;
    emit healthResult(true, info);
}

void LogosStorageService::upload(const QByteArray &data,
                           const QString &mimeType,
                           const QString &filename)
{
    if (!m_online) {
        // Mock: derive CID from content hash
        QTimer::singleShot(800, this, [this, data]() {
            emit uploadComplete(mockCid(data), data.size(), true);
        });
        return;
    }

    QNetworkRequest req(QUrl(m_nodeUrl + "/api/codex/v1/data"));
    req.setHeader(QNetworkRequest::ContentTypeHeader,
                   mimeType.isEmpty() ? "application/octet-stream" : mimeType);
    if (!filename.isEmpty())
        req.setRawHeader("Content-Disposition",
                          QString("attachment; filename=\"%1\"").arg(filename).toLatin1());

    auto *reply = m_nam->post(req, data);

    connect(reply, &QNetworkReply::uploadProgress, this,
            [this](qint64 sent, qint64 total) {
                emit uploadProgress(sent, total);
            });

    connect(reply, &QNetworkReply::finished, this, [this, reply, data]() {
        onUploadReply(reply);
    });
}

void LogosStorageService::onUploadReply(QNetworkReply *reply)
{
    reply->deleteLater();
    if (reply->error() != QNetworkReply::NoError) {
        // Fallback to mock on error
        QByteArray dummyData;
        emit uploadComplete(mockCid(dummyData), 0, true);
        return;
    }
    QString cid = QString::fromUtf8(reply->readAll()).trimmed();
    emit uploadComplete(cid, 0, false);
}

void LogosStorageService::fetchManifest(const QString &cid)
{
    if (!m_online) {
        QTimer::singleShot(400, this, [this, cid]() {
            emit manifestResult(cid, true);
        });
        return;
    }
    QNetworkRequest req(QUrl(m_nodeUrl + "/api/codex/v1/data/" + cid + "/network/manifest"));
    auto *reply = m_nam->get(req);
    connect(reply, &QNetworkReply::finished, this, [this, reply, cid]() {
        bool exists = (reply->error() == QNetworkReply::NoError);
        reply->deleteLater();
        emit manifestResult(cid, exists);
    });
}

QString LogosStorageService::mockCid(const QByteArray &data)
{
    // Deterministic mock CID from content hash (matches JS behaviour)
    QString hash = CryptoService::hashDocument(data).mid(7);
    static const char B58[] = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    QString cid = "Qm";
    for (int i = 0; i < 44; i++) {
        int idx = CryptoService::hexToBytes(hash.mid(i % 64 * 1, 2))[0] % 58;
        cid += B58[qBound(0, idx, 57)];
    }
    return cid;
}

// ─── LogosBlockchainService ─────────────────────────────────────────────────

LogosBlockchainService::LogosBlockchainService(const QString &nodeUrl, QObject *parent)
    : QObject(parent)
    , m_nam(new QNetworkAccessManager(this))
    , m_nodeUrl(nodeUrl)
{}

QNetworkReply *LogosBlockchainService::get(const QString &path)
{
    QNetworkRequest req(QUrl(m_nodeUrl + path));
    req.setRawHeader("Accept", "application/json");
    return m_nam->get(req);
}

void LogosBlockchainService::checkHealth()
{
    auto *reply = get("/cryptarchia/info");
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            m_online = false;
            emit healthResult(false, {{"error", reply->errorString()}});
            return;
        }
        m_online = true;
        auto doc = QJsonDocument::fromJson(reply->readAll());
        QVariantMap info = doc.object().toVariantMap();
        info["online"] = true;
        emit healthResult(true, info);
    });
}

void LogosBlockchainService::anchorDocument(const QString &docHash,
                                    const QString &outletId,
                                    const QString &cid,
                                    const QString &headline)
{
    // Build the inscription payload matching JS exactly
    QJsonObject payload;
    payload["v"]        = "logos-drop/1";
    payload["type"]     = "doc_anchor";
    payload["docHash"]  = docHash;
    payload["cid"]      = cid;
    payload["outletId"] = outletId;
    payload["headline"] = headline.left(128);
    payload["ts"]       = QDateTime::currentMSecsSinceEpoch();

    qDebug() << "[Logos Blockchain] anchorDocument inscription:" << payload;
    qDebug() << "[Logos Blockchain] channel:" << LOGOS_DROP_CHANNEL;

    // Mock response (wallet API pending)
    QTimer::singleShot(2200, this, [this]() {
        emit anchorComplete("0x" + rHex(64), nextMockBlock(), true);
    });
}

void LogosBlockchainService::verifyAnchor(const QString &txHash,
                                  const QString &expectedDocHash)
{
    Q_UNUSED(txHash)
    Q_UNUSED(expectedDocHash)
    QTimer::singleShot(1800, this, [this]() {
        emit verifyResult(true, nextMockBlock(), true);
    });
}

void LogosBlockchainService::lockTip(const QString &anchorId,
                             const QString &ephPubHex,
                             double xmrAmount)
{
    Q_UNUSED(anchorId)
    Q_UNUSED(ephPubHex)
    Q_UNUSED(xmrAmount)
    QTimer::singleShot(1100, this, [this]() {
        emit tipLocked(rHex(16), "0x" + rHex(64), true);
    });
}

void LogosBlockchainService::getOutlets()
{
    QTimer::singleShot(400, this, [this]() {
        emit outletsLoaded(mockOutlets());
    });
}

void LogosBlockchainService::getPublications()
{
    QTimer::singleShot(700, this, [this]() {
        emit publicationsLoaded(mockPublications());
    });
}

int LogosBlockchainService::nextMockBlock()
{
    m_mockBlock += QRandomGenerator::global()->bounded(1, 5);
    return m_mockBlock;
}

QString LogosBlockchainService::rHex(int n)
{
    QByteArray bytes(n / 2 + 1, '\0');
    QRandomGenerator::global()->fillRange(
        reinterpret_cast<quint32*>(bytes.data()),
        bytes.size() / sizeof(quint32) + 1);
    return bytes.toHex().left(n);
}

QVariantList LogosBlockchainService::mockOutlets()
{
    return QVariantList{
        QVariantMap{
            {"id","outlet_1"}, {"name","The Distributed Press"},
            {"topic","/logos-drop/1/submissions/outlet_1/proto"},
            {"pubKeyHex", QString(66, '0')},
            {"stake","12,400 NOM"}, {"docs",47}, {"active",true}
        },
        QVariantMap{
            {"id","outlet_2"}, {"name","Ciphertext Journal"},
            {"topic","/logos-drop/1/submissions/outlet_2/proto"},
            {"pubKeyHex", QString(66, '1')},
            {"stake","8,200 NOM"}, {"docs",23}, {"active",true}
        },
        QVariantMap{
            {"id","outlet_3"}, {"name","Zero Knowledge Reports"},
            {"topic","/logos-drop/1/submissions/outlet_3/proto"},
            {"pubKeyHex", QString(66, '2')},
            {"stake","31,000 NOM"}, {"docs",112}, {"active",true}
        },
    };
}

QVariantList LogosBlockchainService::mockPublications()
{
    qint64 now = QDateTime::currentMSecsSinceEpoch();
    return QVariantList{
        QVariantMap{
            {"id","pub_1"},
            {"headline","Internal Memos Reveal Systematic Data Retention Violations"},
            {"outlet","Zero Knowledge Reports"}, {"outletId","outlet_3"},
            {"cid","QmMockCID1"}, {"hash","sha256:" + QString(64,'a')},
            {"txHash","0x" + QString(64,'b')}, {"block",848201},
            {"ts", now - 432000000}, {"tags", QStringList{"corporate","data-privacy"}},
            {"tipPool","0.34 XMR"}, {"verified",true},
            {"summary","Documents show a major technology firm retained user communications for up to 7 years beyond stated policy, directly violating published privacy commitments."}
        },
        QVariantMap{
            {"id","pub_2"},
            {"headline","Procurement Records Expose Pattern of Regulatory Capture"},
            {"outlet","The Distributed Press"}, {"outletId","outlet_1"},
            {"cid","QmMockCID2"}, {"hash","sha256:" + QString(64,'c')},
            {"txHash","0x" + QString(64,'d')}, {"block",841932},
            {"ts", now - 1036800000}, {"tags", QStringList{"government","finance"}},
            {"tipPool","1.20 XMR"}, {"verified",true},
            {"summary","Procurement documents cross-referenced with lobbying disclosures reveal a coordinated strategy to influence regulatory outcomes across three separate agencies."}
        },
        QVariantMap{
            {"id","pub_3"},
            {"headline","Leaked Audit: Environmental Compliance Data Falsified for 4 Years"},
            {"outlet","Ciphertext Journal"}, {"outletId","outlet_2"},
            {"cid","QmMockCID3"}, {"hash","sha256:" + QString(64,'e')},
            {"txHash","0x" + QString(64,'f')}, {"block",839104},
            {"ts", now - 1814400000}, {"tags", QStringList{"environment","fraud"}},
            {"tipPool","0.78 XMR"}, {"verified",true},
            {"summary","An internal audit shows that environmental monitoring reports submitted to regulators were systematically altered to conceal exceedances of permitted emission levels."}
        },
    };
}
