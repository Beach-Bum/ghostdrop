// ghostdrop_module_plugin.cpp
#include "ghostdrop_module_plugin.h"
#include <QDebug>

GhostDropModulePlugin::GhostDropModulePlugin(QObject *parent)
    : QObject(parent)
    , m_core(new GhostDropCore(this))
{
    qDebug() << "GhostDropModulePlugin: initialized";

    // Wire GhostDropCore signals → Logos events
    connect(m_core, &GhostDropCore::stripProgress,
            this, [this](const QString &stage, int pct) {
                emitEvent("stripProgress", {stage, pct});
            });
    connect(m_core, &GhostDropCore::stripComplete,
            this, [this](const QVariantMap &report, const QByteArray &bytes) {
                emitEvent("stripComplete", {report, bytes.toHex()});
            });
    connect(m_core, &GhostDropCore::stripError,
            this, [this](const QString &err) {
                emitEvent("stripError", {err});
            });
    connect(m_core, &GhostDropCore::outletsLoaded,
            this, [this](const QVariantList &outlets) {
                emitEvent("outletsLoaded", {QVariant(outlets)});
            });
    connect(m_core, &GhostDropCore::submitLog,
            this, [this](const QString &msg, const QString &color) {
                emitEvent("submitLog", {msg, color});
            });
    connect(m_core, &GhostDropCore::submitComplete,
            this, [this](const QVariantMap &receipt) {
                emitEvent("submitComplete", {receipt});
            });
    connect(m_core, &GhostDropCore::submitError,
            this, [this](const QString &err) {
                emitEvent("submitError", {err});
            });
    connect(m_core, &GhostDropCore::backChannelMessages,
            this, [this](const QVariantList &msgs) {
                emitEvent("backChannelMessages", {QVariant(msgs)});
            });
    connect(m_core, &GhostDropCore::inboxLoaded,
            this, [this](const QVariantList &inbox) {
                emitEvent("inboxLoaded", {QVariant(inbox)});
            });
    connect(m_core, &GhostDropCore::publishLog,
            this, [this](const QString &msg, const QString &color) {
                emitEvent("publishLog", {msg, color});
            });
    connect(m_core, &GhostDropCore::publishComplete,
            this, [this](const QVariantMap &record) {
                emitEvent("publishComplete", {record});
            });
    connect(m_core, &GhostDropCore::publishError,
            this, [this](const QString &err) {
                emitEvent("publishError", {err});
            });
    connect(m_core, &GhostDropCore::publicationsLoaded,
            this, [this](const QVariantList &pubs) {
                emitEvent("publicationsLoaded", {QVariant(pubs)});
            });
    connect(m_core, &GhostDropCore::verifyResult,
            this, [this](bool nomos, bool codex, bool mock) {
                emitEvent("verifyResult", {nomos, codex, mock});
            });
    connect(m_core, &GhostDropCore::tipLocked,
            this, [this](const QString &txHash, bool mock) {
                emitEvent("tipLocked", {txHash, mock});
            });
    connect(m_core, &GhostDropCore::nodeStatus,
            this, [this](bool codex, bool nomos, const QVariantMap &info) {
                emitEvent("nodeStatus", {codex, nomos, info});
            });
}

GhostDropModulePlugin::~GhostDropModulePlugin()
{
    if (m_logosAPI) { delete m_logosAPI; m_logosAPI = nullptr; }
}

void GhostDropModulePlugin::initLogos(LogosAPI *logosAPI)
{
    m_logosAPI = logosAPI;
    m_core->setLogosAPI(logosAPI);
}

void GhostDropModulePlugin::emitEvent(const QString &name, const QVariantList &data)
{
    if (m_logosAPI)
        m_logosAPI->getClient("core_manager")->onEventResponse(this, name, data);
}

// ─── Interface forwarding ─────────────────────────────────────────

QVariantMap GhostDropModulePlugin::scanFile(const QString &fileDataHex,
                                              const QString &mimeType)
{
    return m_core->scanFile(QByteArray::fromHex(fileDataHex.toLatin1()), mimeType);
}

void GhostDropModulePlugin::stripFile(const QString &fileDataHex,
                                       const QString &mimeType,
                                       const QString &filename)
{
    m_core->stripFile(QByteArray::fromHex(fileDataHex.toLatin1()), mimeType, filename);
}

void GhostDropModulePlugin::loadOutlets() { m_core->loadOutlets(); }

void GhostDropModulePlugin::submitDocument(const QString &fileDataHex,
                                            const QString &mimeType,
                                            const QString &outletId,
                                            const QString &outletPubKeyHex,
                                            const QString &outletTopic,
                                            const QString &coverNote,
                                            const QVariantMap &stripReport)
{
    m_core->submitDocument(
        QByteArray::fromHex(fileDataHex.toLatin1()),
        mimeType, outletId, outletPubKeyHex, outletTopic, coverNote, stripReport);
}

void GhostDropModulePlugin::pollBackChannel(const QString &ephPubHex)
{
    m_core->pollBackChannel(ephPubHex);
}

void GhostDropModulePlugin::loadInbox(const QString &outletId)
{
    m_core->loadInbox(outletId);
}

void GhostDropModulePlugin::publishDocument(const QString &headline,
                                             const QString &docDataHex,
                                             const QString &mimeType,
                                             const QString &outletId,
                                             const QVariantMap &meta)
{
    m_core->publishDocument(
        headline, QByteArray::fromHex(docDataHex.toLatin1()),
        mimeType, outletId, meta);
}

void GhostDropModulePlugin::rejectSubmission(const QString &ephPubHex,
                                              const QString &outletId,
                                              const QString &reason)
{
    m_core->rejectSubmission(ephPubHex, outletId, reason);
}

void GhostDropModulePlugin::loadPublications() { m_core->loadPublications(); }

void GhostDropModulePlugin::verifyDocument(const QString &txHash,
                                            const QString &cid,
                                            const QString &expectedHash)
{
    m_core->verifyDocument(txHash, cid, expectedHash);
}

void GhostDropModulePlugin::lockTip(const QString &anchorId,
                                     const QString &ephPubHex,
                                     double amount)
{
    m_core->lockTip(anchorId, ephPubHex, amount);
}

void GhostDropModulePlugin::checkNodeStatus() { m_core->checkNodeStatus(); }
