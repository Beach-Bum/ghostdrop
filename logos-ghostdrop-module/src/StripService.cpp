// StripService.cpp
#include "StripService.h"
#include "CryptoService.h"

#include <QBuffer>
#include <QDateTime>
#include <QImageReader>
#include <QImageWriter>
#include <QRegularExpression>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDebug>
#include <QtConcurrent/QtConcurrent>

// QuaZip for DOCX (OOXML = ZIP)
// We use Qt's built-in zip support via QZipReader/QZipWriter
#include <private/qzipreader_p.h>
#include <private/qzipwriter_p.h>

// ─── Helpers ─────────────────────────────────────────────────────

static const QMap<QString,QString> MIME_BY_EXT = {
    {".pdf",  "application/pdf"},
    {".jpg",  "image/jpeg"}, {".jpeg","image/jpeg"},
    {".png",  "image/png"},  {".tiff","image/tiff"},
    {".tif",  "image/tiff"}, {".webp","image/webp"},
    {".gif",  "image/gif"},
    {".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    {".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
    {".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    {".txt",  "text/plain"}, {".md",  "text/markdown"},
};

static const QStringList OOXML_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

QString StripService::guessMime(const QString &filename)
{
    QString ext = filename.mid(filename.lastIndexOf('.')).toLower();
    return MIME_BY_EXT.value(ext, "application/octet-stream");
}

QString StripService::formatRisk(const QString &risk)
{
    static const QMap<QString,QString> map = {
        {"critical","🔴"}, {"high","🟠"}, {"medium","🟡"}, {"low","🔵"}
    };
    return map.value(risk, "⚪");
}

QVariantMap StripReport::toVariantMap() const
{
    QVariantList fields;
    for (const auto &f : fieldsRemoved)
        fields << QVariantMap{{"field",f.field},{"value",f.value},{"risk",f.risk}};

    return QVariantMap{
        {"technique",    technique},
        {"fieldsRemoved",fields},
        {"warnings",     warnings},
        {"originalHash", originalHash},
        {"strippedHash", strippedHash},
        {"changed",      changed},
        {"ts",           ts},
        {"mimeType",     mimeType},
        {"originalSize", originalSize},
        {"strippedSize", strippedSize},
        {"error",        error},
    };
}

// ─── Constructor ──────────────────────────────────────────────────

StripService::StripService(QObject *parent) : QObject(parent) {}

// ─── Async entry point ────────────────────────────────────────────

void StripService::stripMetadata(const QByteArray &fileData,
                                   const QString    &mimeType,
                                   const QString    &filename)
{
    QString mime = mimeType.isEmpty() ? guessMime(filename) : mimeType;

    // Run stripping in a background thread
    auto future = QtConcurrent::run([this, fileData, mime]() -> StripResult {
        emit stripProgress("hashing", 0);
        QString origHash = CryptoService::hashDocument(fileData);
        emit stripProgress("analysing", 10);

        StripResult result;
        if (mime == "application/pdf") {
            result = stripPdf(fileData);
        } else if (mime.startsWith("image/")) {
            result = stripImage(fileData, mime);
        } else if (OOXML_TYPES.contains(mime)) {
            result = stripOoxml(fileData, mime);
        } else {
            result = stripText(fileData, mime);
        }

        emit stripProgress("hashing-result", 90);
        result.report.originalHash = origHash;
        result.report.strippedHash = CryptoService::hashDocument(result.strippedBytes);
        result.report.changed      = (origHash != result.report.strippedHash);
        result.report.ts           = QDateTime::currentMSecsSinceEpoch();
        result.report.mimeType     = mime;
        result.report.originalSize = fileData.size();
        result.report.strippedSize = result.strippedBytes.size();
        result.mimeType            = mime;

        emit stripProgress("complete", 100);
        return result;
    });

    // Wire future watcher
    auto *watcher = new QFutureWatcher<StripResult>(this);
    connect(watcher, &QFutureWatcher<StripResult>::finished, this, [this, watcher]() {
        StripResult result = watcher->result();
        watcher->deleteLater();
        if (result.report.hasError())
            emit stripError(result.report.error);
        else
            emit stripComplete(result);
    });
    watcher->setFuture(future);
}

// ─── PDF strip ────────────────────────────────────────────────────
// Regex-based InfoDict patch (portable, no poppler dependency).
// Clears standard PDF metadata fields.

StripResult StripService::stripPdf(const QByteArray &data)
{
    StripResult result;
    result.report.technique = "pdf-infodict-patch";

    QString pdf = QString::fromLatin1(data);
    QList<StripField> removed;

    // Patch InfoDict string entries
    static const QList<QPair<QString,QString>> patches = {
        {R"(/Author\s*\(([^)]*)\))",   "/Author ()"},
        {R"(/Title\s*\(([^)]*)\))",    "/Title ()"},
        {R"(/Subject\s*\(([^)]*)\))",  "/Subject ()"},
        {R"(/Keywords\s*\(([^)]*)\))", "/Keywords ()"},
        {R"(/Creator\s*\(([^)]*)\))",  "/Creator (LogosDrop)"},
        {R"(/Producer\s*\(([^)]*)\))", "/Producer (LogosDrop)"},
    };

    for (const auto &[pattern, replacement] : patches) {
        QRegularExpression re(pattern);
        auto match = re.match(pdf);
        if (match.hasMatch() && !match.captured(1).trimmed().isEmpty()) {
            QString fieldName = pattern.mid(1, pattern.indexOf('\\') - 1);
            removed.append({fieldName, match.captured(1).left(60), "high"});
            pdf.replace(re, replacement);
        }
    }

    // Patch date entries (different format: /CreationDate (D:...))
    static const QList<QPair<QString,QString>> datePatches = {
        {R"(/CreationDate\s*\([^)]*\))",    "/CreationDate (D:19700101000000)"},
        {R"(/ModDate\s*\([^)]*\))",         "/ModDate (D:19700101000000)"},
    };
    for (const auto &[pattern, replacement] : datePatches) {
        QRegularExpression re(pattern);
        if (re.match(pdf).hasMatch()) {
            removed.append({pattern.mid(1, pattern.indexOf('\\') - 1), "date", "medium"});
            pdf.replace(re, replacement);
        }
    }

    // Remove XMP metadata streams
    QRegularExpression xmpRe(R"(<\?xpacket[^?]*\?>.*?<\?xpacket[^?]*end[^?]*\?>)",
                               QRegularExpression::DotMatchesEverythingOption);
    if (xmpRe.match(pdf).hasMatch()) {
        removed.append({"XMP metadata stream", "present", "high"});
        pdf.replace(xmpRe, "");
    }

    if (removed.isEmpty())
        result.report.warnings << "No metadata found in PDF InfoDict — file may already be clean.";

    result.strippedBytes      = pdf.toLatin1();
    result.report.fieldsRemoved = removed;
    return result;
}

// ─── Image strip ─────────────────────────────────────────────────
// Re-render via Qt — strips ALL EXIF/GPS/IPTC/XMP.
// Matches the canvas-redraw approach in strip.js.

StripResult StripService::stripImage(const QByteArray &data,
                                       const QString    &mimeType)
{
    StripResult result;
    result.report.technique = "qt-image-redraw";

    QImage img;
    if (!img.loadFromData(data)) {
        result.report.error = "Failed to decode image";
        result.strippedBytes = data;
        return result;
    }

    // Draw to a fresh QImage — Qt discards all metadata
    QImage clean(img.size(), QImage::Format_RGBA8888);
    clean.fill(Qt::transparent);
    QPainter p(&clean);
    p.drawImage(0, 0, img);
    p.end();

    // Encode as PNG (lossless) or JPEG
    QBuffer buf;
    buf.open(QIODevice::WriteOnly);
    QString format = (mimeType == "image/png" || mimeType == "image/gif") ? "PNG" : "JPEG";
    clean.save(&buf, format.toLatin1().constData(), format == "JPEG" ? 92 : -1);

    result.strippedBytes = buf.data();
    result.report.fieldsRemoved = {
        {"EXIF IFD0",   "Cleared (camera make/model/settings)", "high"},
        {"GPS IFD",     "Cleared (location coordinates)",        "critical"},
        {"MakerNotes",  "Cleared (manufacturer-specific data)",  "medium"},
        {"IPTC data",   "Cleared (caption, copyright, contact)", "high"},
        {"XMP packet",  "Cleared (Adobe/Dublin Core metadata)",  "high"},
        {"ICC profile", "Stripped",                              "low"},
        {"Thumbnail",   "Cleared (embedded preview image)",      "medium"},
    };

    if (mimeType == "image/jpeg")
        result.report.warnings << "JPEG re-encoded at quality 92 — minor quality reduction.";
    else if (format == "JPEG")
        result.report.warnings
            << QString("Format converted %1 → JPEG (slight quality loss).").arg(mimeType);

    return result;
}

// ─── DOCX/XLSX/PPTX strip ────────────────────────────────────────
// Patches docProps/core.xml and docProps/app.xml inside the ZIP.

QByteArray StripService::patchXml(const QByteArray &xml,
                                    const QList<QPair<QString,QString>> &replacements,
                                    QList<StripField> &removed,
                                    const QString &source)
{
    QString str = QString::fromUtf8(xml);
    for (const auto &[pattern, replacement] : replacements) {
        QRegularExpression re(pattern, QRegularExpression::DotMatchesEverythingOption);
        auto m = re.match(str);
        if (m.hasMatch()) {
            QString captured = m.captured(1).trimmed();
            if (!captured.isEmpty()) {
                // Extract field name from pattern
                QString name = pattern.mid(1, pattern.indexOf('[') - 1)
                    .replace(QRegularExpression(R"([<>/\\^])"), "");
                removed.append({name + " (" + source + ")", captured.left(60), "high"});
                str.replace(re, replacement);
            }
        }
    }
    return str.toUtf8();
}

StripResult StripService::stripOoxml(const QByteArray &data,
                                       const QString    &mimeType)
{
    StripResult result;
    result.report.technique = "ooxml-xml-patch";

    // Read ZIP
    QBuffer inBuf;
    inBuf.setData(data);
    inBuf.open(QIODevice::ReadOnly);
    QZipReader reader(&inBuf);

    if (reader.status() != QZipReader::NoError) {
        result.report.error   = "Failed to open OOXML as ZIP";
        result.strippedBytes  = data;
        return result;
    }

    QList<StripField> removed;

    // Build patched file list
    QBuffer outBuf;
    outBuf.open(QIODevice::WriteOnly);
    QZipWriter writer(&outBuf);
    writer.setCompressionPolicy(QZipWriter::AlwaysCompress);

    for (const auto &fileInfo : reader.fileInfoList()) {
        QByteArray fileData = reader.fileData(fileInfo.filePath);

        if (fileInfo.filePath == "docProps/core.xml") {
            static const QList<QPair<QString,QString>> corePatches = {
                {R"(<dc:creator[^>]*>(.*?)</dc:creator>)",         "<dc:creator></dc:creator>"},
                {R"(<dc:lastModifiedBy[^>]*>(.*?)</dc:lastModifiedBy>)", "<dc:lastModifiedBy></dc:lastModifiedBy>"},
                {R"(<dc:description[^>]*>(.*?)</dc:description>)",  "<dc:description></dc:description>"},
                {R"(<dc:subject[^>]*>(.*?)</dc:subject>)",          "<dc:subject></dc:subject>"},
                {R"(<dc:title[^>]*>(.*?)</dc:title>)",              "<dc:title></dc:title>"},
                {R"(<cp:revision[^>]*>(.*?)</cp:revision>)",        "<cp:revision>1</cp:revision>"},
                {R"(<cp:keywords[^>]*>(.*?)</cp:keywords>)",        "<cp:keywords></cp:keywords>"},
            };
            fileData = patchXml(fileData, corePatches, removed, "core.xml");
        } else if (fileInfo.filePath == "docProps/app.xml") {
            static const QList<QPair<QString,QString>> appPatches = {
                {R"(<Application[^>]*>(.*?)</Application>)", "<Application>LogosDrop</Application>"},
                {R"(<Company[^>]*>(.*?)</Company>)",          "<Company></Company>"},
                {R"(<Manager[^>]*>(.*?)</Manager>)",          "<Manager></Manager>"},
                {R"(<Template[^>]*>(.*?)</Template>)",        "<Template>Normal</Template>"},
            };
            fileData = patchXml(fileData, appPatches, removed, "app.xml");
        }

        writer.addFile(fileInfo.filePath, fileData);
    }

    writer.close();
    result.strippedBytes      = outBuf.data();
    result.report.fieldsRemoved = removed;

    if (removed.isEmpty())
        result.report.warnings << "No metadata found — document may already be clean.";
    else
        result.report.warnings << "Embedded images within the document may still contain EXIF data.";

    return result;
}

StripResult StripService::stripText(const QByteArray &data,
                                     const QString    &mimeType)
{
    StripResult result;
    result.strippedBytes      = data;
    result.report.technique   = "passthrough";
    result.report.fieldsRemoved = {};
    if (OOXML_TYPES.contains(mimeType))
        result.report.warnings << "Unsupported OOXML format.";
    else
        result.report.warnings << "Text files carry no embedded metadata.";
    return result;
}

// ─── Scan ─────────────────────────────────────────────────────────

StripService::ScanResult StripService::scanMetadata(const QByteArray &data,
                                                     const QString    &mimeType)
{
    ScanResult result;

    if (mimeType == "application/pdf") {
        QString pdf = QString::fromLatin1(data);
        static const QList<QPair<QString,QString>> fields = {
            {R"(/Author\s*\(([^)]+)\))",   "Author"},
            {R"(/Creator\s*\(([^)]+)\))",  "Creator"},
            {R"(/Producer\s*\(([^)]+)\))", "Producer"},
            {R"(/Title\s*\(([^)]+)\))",    "Title"},
            {R"(/Keywords\s*\(([^)]+)\))", "Keywords"},
        };
        for (const auto &[pattern, name] : fields) {
            QRegularExpression re(pattern);
            auto m = re.match(pdf);
            if (m.hasMatch() && !m.captured(1).trimmed().isEmpty())
                result.fields.append({name, m.captured(1).trimmed().left(80), "high"});
        }
    } else if (mimeType.startsWith("image/")) {
        // Basic JPEG APP1/EXIF detection
        if (mimeType == "image/jpeg" && data.size() > 4) {
            if (static_cast<unsigned char>(data[0]) == 0xFF &&
                static_cast<unsigned char>(data[1]) == 0xD8) {
                // Has JPEG header — check for EXIF marker
                if (data.contains("Exif")) {
                    result.fields.append({"EXIF data", "present", "high"});
                    result.hasGPS = data.contains("GPS");
                }
            }
        }
        result.hasPrinterDots = (mimeType == "image/jpeg");
    } else if (OOXML_TYPES.contains(mimeType)) {
        QBuffer buf;
        buf.setData(data);
        buf.open(QIODevice::ReadOnly);
        QZipReader reader(&buf);
        QByteArray coreXml = reader.fileData("docProps/core.xml");
        if (!coreXml.isEmpty()) {
            QString xml = QString::fromUtf8(coreXml);
            static const QList<QPair<QString,QString>> extractors = {
                {R"(<dc:creator[^>]*>(.*?)</dc:creator>)",    "Author"},
                {R"(<dc:lastModifiedBy[^>]*>(.*?)</dc:lastModifiedBy>)", "Last editor"},
            };
            for (const auto &[pattern, name] : extractors) {
                QRegularExpression re(pattern, QRegularExpression::DotMatchesEverythingOption);
                auto m = re.match(xml);
                if (m.hasMatch() && !m.captured(1).trimmed().isEmpty())
                    result.fields.append({name, m.captured(1).trimmed().left(60), "critical"});
            }
        }
    }

    return result;
}
