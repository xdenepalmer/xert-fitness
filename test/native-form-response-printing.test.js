import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('native form responses prefer immutable snapshots and preserve every stored answer', async () => {
  const [models, api] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/XertAPI.swift'),
  ]);

  assert.match(models, /struct AdminFormSnapshot: Codable, Hashable/);
  assert.match(models, /let snapshot_source: String\?/);
  assert.match(models, /let header_media_type: String\?/);
  assert.match(models, /let header_media_url: String\?/);
  assert.match(models, /let header_media_caption: String\?/);
  assert.match(models, /struct AdminFormSubmissionRecord: Hashable/);
  assert.match(models, /let questions = snapshot\?\.questions \?\? form\.questions/);
  assert.match(models, /for questionID in response\.answers\.keys\.sorted\(\)/);
  assert.match(models, /archivedFieldType\(for: response\.answers\[questionID\]\)/);
  assert.match(models, /title: wasSkipped \? "Answer stored for a branched field"/);
  assert.match(models, /skippedQuestionIDs\(questions: questions, answers: response\.answers\)/);
  assert.match(models, /guard !skipped\.contains\(question\.id\) else \{ continue \}/);
  assert.match(models, /oneResponsePerEmail && !collectEmailRequired/);
  assert.match(models, /mutating func setOneResponsePerEmail\(_ enabled: Bool\)[\s\S]*collectEmail = true[\s\S]*collectEmailRequired = true/);
  assert.match(models, /if usesSubmissionSnapshot \{[\s\S]*recordItems\.append\(\.statement/);
  assert.match(models, /snapshotSource == "legacy_backfill"[\s\S]*Legacy record - labels and layout reconstructed; not guaranteed exact/);
  assert.match(models, /Reconstructed form layout - not verified as presented/);
  assert.match(models, /Reconstructed statement/);
  const listRequest = api.slice(api.indexOf('func adminFormResponses('), api.indexOf('func adminFormResponse('));
  const detailRequest = api.slice(api.indexOf('func adminFormResponse('), api.indexOf('func adminSaveForm('));
  assert.doesNotMatch(listRequest, /form_snapshot/);
  assert.match(detailRequest, /\\\(legacySelect\),form_snapshot/);
  assert.match(detailRequest, /error\.statusCode == 400 && error\.message\.localizedCaseInsensitiveContains\("form_snapshot"\)/);
  assert.match(detailRequest, /guard rows\.count == 1/);
});

test('native individual response is a full form-like record with explicit archival metadata', async () => {
  const [view, forms] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormResponseView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift'),
  ]);

  assert.match(view, /private var submissionPaper: some View/);
  assert.match(view, /ForEach\(record\.items\)/);
  assert.match(view, /metadataRow\("Record ID", activeResponse\.id\.uuidString\.lowercased\(\)\)/);
  assert.match(view, /TimeZone\(identifier: "Australia\/Brisbane"\)/);
  assert.match(view, /Operational status is separate from the immutable submitted answers below/);
  assert.match(view, /\.task \{ await loadRecord\(\) \}/);
  assert.match(view, /Full response unavailable/);
  assert.match(view, /AdminFormResponseValueFormatter\.signatureImage/);
  assert.match(view, /Label\("ARCHIVED ANSWER"/);
  assert.match(view, /\.textSelection\(\.enabled\)/);
  assert.match(forms, /set: \{ draft\.setOneResponsePerEmail\(\$0\) \}/);
});

test('native printable records preserve textual media references and layout descriptions without fetching assets', async () => {
  const [models, view, document] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/AdminModels.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormResponseView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/AdminFormResponseDocument.swift'),
  ]);

  assert.match(models, /struct AdminFormMediaReference: Hashable/);
  assert.match(models, /let headerMedia: AdminFormMediaReference\?/);
  assert.match(models, /snapshot == nil \? form\.header_media_type : snapshot\?\.header_media_type/);
  assert.match(models, /struct AdminFormSubmissionContentRow: Identifiable, Hashable[\s\S]*let description: String\?[\s\S]*let media: AdminFormMediaReference\?/);
  assert.match(models, /description: question\.description,[\s\S]*media: media/);
  assert.match(models, /External media is referenced only; it is not embedded or downloaded into this record/);
  assert.match(models, /Legal or consent wording should be captured in the form content itself/);

  assert.match(view, /mediaReference\(headerMedia, label: "Header media"\)/);
  assert.match(view, /mediaReference\(media, label: "Section media"\)/);
  assert.match(view, /mediaReference\(media, label: "Statement media"\)/);
  assert.match(view, /mediaReference\(media, label: "Question media"\)/);
  assert.match(view, /mediaReferenceRow\("Type", media\.typeLabel\)/);
  assert.match(view, /mediaReferenceRow\("URL", media\.url \?\? "Not recorded"\)/);
  assert.match(view, /mediaReferenceRow\("Caption", media\.caption \?\? "Not recorded"\)/);

  assert.match(document, /drawMediaReference\(headerMedia, label: "Header media"\)/);
  assert.match(document, /drawMediaReference\(media, label: "Section media"\)/);
  assert.match(document, /drawMediaReference\(media, label: "Statement media"\)/);
  assert.match(document, /drawMediaReference\(media, label: "Question media"\)/);
  assert.match(document, /AdminFormMediaReference\.preservationNote/);
  assert.doesNotMatch(`${view}\n${document}`, /URLSession|AsyncImage|Data\(contentsOf:.*https?:/);
});

test('native response PDF supports preview, share, AirPrint and private temporary cleanup', async () => {
  const [view, document] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormResponseView.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Services/AdminFormResponseDocument.swift'),
  ]);

  assert.match(view, /AdminFormResponsePDFPreview/);
  assert.match(view, /ShareLink\([\s\S]*item: pdfURL/);
  assert.match(view, /Label\("Print PDF", systemImage: "printer"\)/);
  assert.match(document, /UIGraphicsPDFRenderer\(bounds: pageBounds/);
  assert.match(document, /options: \[\.atomic, \.completeFileProtection\]/);
  assert.match(document, /directory\.deletingLastPathComponent\(\)\.standardizedFileURL == rootDirectory\.standardizedFileURL/);
  assert.match(document, /UIPrintInteractionController\.isPrintingAvailable/);
  assert.match(document, /static func removeExport\(at fileURL: URL\?\)/);
  assert.match(document, /"Record ID", response\.id\.uuidString\.lowercased\(\)/);
  assert.match(document, /private func drawOperationalStatus\(_ status: String\)/);
  assert.match(document, /OPERATIONAL STATUS AT EXPORT/);
  assert.match(view, /\.onDisappear \{ discardPDF\(\) \}/);
});

test('native signature rendering is bounded and file uploads expose metadata rather than invented files', async () => {
  const document = await read('../ios/XertFitnessApp/XertFitnessApp/Services/AdminFormResponseDocument.swift');

  assert.match(document, /maximumSignatureBytes = 2_000_000/);
  assert.match(document, /maximumSignaturePixels = 16_000_000/);
  assert.match(document, /prefix == "data:image\/png;base64" \|\| prefix == "data:image\/jpeg;base64"/);
  assert.match(document, /CGImageSourceCopyPropertiesAtIndex/);
  assert.match(document, /"Signature captured - preview unavailable"/);
  assert.match(document, /ByteCountFormatter\.string/);
  assert.match(document, /let knownKeys = Set\(\["name", "type", "size"\]\)/);
  assert.doesNotMatch(document, /URLSession|Data\(contentsOf:.*http/);
});

test('native form QR is generated locally with high correction and a bounded centred XERT mark', async () => {
  const [generator, forms, asset, sourceLogo] = await Promise.all([
    read('../ios/XertFitnessApp/XertFitnessApp/Services/AdminFormQRCode.swift'),
    read('../ios/XertFitnessApp/XertFitnessApp/Views/AdminFormsView.swift'),
    readFile(new URL('../ios/XertFitnessApp/XertFitnessApp/Assets.xcassets/XertQRLogo.imageset/xert-qr-logo.png', import.meta.url)),
    readFile(new URL('../public/assets/xert-logo-icon.png', import.meta.url)),
  ]);

  assert.match(generator, /CIFilter\.qrCodeGenerator\(\)/);
  assert.match(generator, /filter\.correctionLevel = "H"/);
  assert.match(generator, /static let pixelDimension = 1_024/);
  assert.match(generator, /static let logoWidthRatio: CGFloat = 0\.16/);
  assert.match(generator, /static let protectedLogoWidthRatio: CGFloat = 0\.20/);
  assert.match(generator, /UIImage\(named: "XertQRLogo"\)/);
  assert.match(generator, /UIImage\(cgImage: qrCGImage\)\.draw\(in: qrRect\)/);
  assert.match(generator, /cg\.interpolationQuality = \.high\s+logo\.draw\(in: logoRect\)/);
  assert.match(generator, /x: canvasSide \/ 2 - logoSide \/ 2[\s\S]*y: canvasSide \/ 2 - logoSide \/ 2/);
  assert.match(generator, /options: \[\.atomic, \.completeFileProtection\]/);
  assert.doesNotMatch(generator, /URLSession|https?:\/\//);
  assert.deepEqual(asset, sourceLogo);

  assert.match(forms, /Section\("Branded QR code"\)/);
  assert.match(forms, /ShareLink\([\s\S]*item: qrCodeURL/);
  assert.match(forms, /Label\("Print QR code", systemImage: "printer"\)/);
  assert.match(forms, /Text\(form\.publicURL\.absoluteString\)/);
  assert.match(forms, /\.onDisappear \{[\s\S]*discardQRCode\(\)/);
});
