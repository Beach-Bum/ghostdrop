#pragma once
// StripService.h
//
// Native C++ port of ghostdrop/src/services/strip.js
//
// Strips identifying metadata from documents.
// Supported formats:
//   PDF    — Clears InfoDict fields (Author, Creator, Dates, etc.)
//            Uses libpoppler if available; falls back to regex patch.
//   Images — Re-renders via Qt (strips ALL EXIF/GPS/IPTC/XMP)
//   DOCX   — Patches docProps/core.xml and app.xml inside the ZIP
//   Text   — Passthrough

#include <QObject>
#include <QByteArray>
#include <QString>
#include <QVariantList>
#include <QVariantMap>
#include <QImage>

struct StripField {
    QString field;
    QString value;
    QString risk;  // "critical" | "high" | "medium" | "low"
};

struct StripReport {
    QString    technique;
    QList<StripField> fieldsRemoved;
    QStringList       warnings;
    QString    originalHash;
    QString    strippedHash;
    bool       changed = false;
    qint64     ts = 0;
    QString    mimeType;
    qint64     originalSize = 0;
    qint64     strippedSize = 0;
    QString    error;

    bool hasError() const { return !error.isEmpty(); }

    QVariantMap toVariantMap() const;
};

struct StripResult {
    QByteArray strippedBytes;
    QString    mimeType;
    StripReport report;
};

class StripService : public QObject
{
    Q_OBJECT
public:
    explicit StripService(QObject *parent = nullptr);

    // Async strip — emits stripComplete or stripError
    void stripMetadata(const QByteArray &fileData,
                       const QString    &mimeType,
                       const QString    &filename = QString());

    // Quick scan for metadata fields without stripping
    // Returns immediately (synchronous for UI preview)
    struct ScanResult {
        QList<StripField> fields;
        bool hasGPS = false;
        bool hasPrinterDots = false;
    };
    static ScanResult scanMetadata(const QByteArray &data, const QString &mimeType);

    static QString guessMime(const QString &filename);
    static QString formatRisk(const QString &risk);

signals:
    void stripProgress(const QString &stage, int percent);
    void stripComplete(const StripResult &result);
    void stripError(const QString &error);

private:
    // Format-specific strip implementations
    static StripResult stripPdf(const QByteArray &data);
    static StripResult stripImage(const QByteArray &data, const QString &mimeType);
    static StripResult stripOoxml(const QByteArray &data, const QString &mimeType);
    static StripResult stripText(const QByteArray &data, const QString &mimeType);

    static QByteArray patchXml(const QByteArray &xml,
                                 const QList<QPair<QString,QString>> &replacements,
                                 QList<StripField> &removed,
                                 const QString &source);
};
