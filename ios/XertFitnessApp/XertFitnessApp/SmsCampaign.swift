import Foundation

// ─── SMS campaigns ───────────────────────────────────────────────────────────
// Mirrors src/lib/smsCampaigns.js so the phone and the web agree on which
// numbers are sendable and what a message costs. Twilio credentials live only
// in the Vercel function; the app never holds them.

enum SmsCampaign {
    static let maxMessageLength = 1600
    static let maxRecipients = 500

    /// Australian mobiles normalised to E.164. Anything else returns nil: a
    /// landline or overseas number is refused rather than guessed at.
    static func normalizeAUMobile(_ value: String?) -> String? {
        let raw = value ?? ""
        var bare = raw.filter { $0.isNumber || $0 == "+" }
        if bare.hasPrefix("+") { bare.removeFirst() }
        guard bare.allSatisfy(\.isNumber) else { return nil }
        if bare.count == 11, bare.hasPrefix("614") { return "+\(bare)" }
        if bare.count == 10, bare.hasPrefix("04") { return "+61\(bare.dropFirst())" }
        return nil
    }

    struct Segments: Equatable {
        let characters: Int
        let segments: Int
        let isUnicode: Bool

        var encodingLabel: String { isUnicode ? "Unicode" : "GSM-7" }
    }

    // GSM 03.38 characters that occupy two septets in the basic alphabet.
    private static let gsmExtended: Set<Character> = ["^", "{", "}", "\\", "[", "]", "~", "|", "€"]
    private static let gsmBasic: Set<Character> = {
        var set = Set<Character>()
        set.formUnion("@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?")
        set.formUnion("¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà")
        set.formUnion("\n\r")
        set.formUnion(gsmExtended)
        return set
    }()

    static func segments(for message: String) -> Segments {
        if message.isEmpty { return Segments(characters: 0, segments: 0, isUnicode: false) }
        let isUnicode = message.contains { !gsmBasic.contains($0) }
        if isUnicode {
            let characters = message.unicodeScalars.reduce(0) { $0 + ($1.value > 0xFFFF ? 2 : 1) }
            let count = characters <= 70 ? 1 : Int(ceil(Double(characters) / 67))
            return Segments(characters: characters, segments: count, isUnicode: true)
        }
        let characters = message.reduce(0) { $0 + (gsmExtended.contains($1) ? 2 : 1) }
        let count = characters <= 160 ? 1 : Int(ceil(Double(characters) / 153))
        return Segments(characters: characters, segments: count, isUnicode: false)
    }

    struct Recipient: Identifiable, Hashable {
        var id: String { phone }
        let name: String
        let phone: String
        let detail: String
    }

    struct Audience: Equatable {
        let recipients: [Recipient]
        let missingPhone: Int
        let invalidPhone: Int
        let duplicates: Int

        var skipped: Int { missingPhone + invalidPhone }
    }

    struct Contact {
        let name: String
        let phone: String?
        let detail: String
    }

    /// Contacts from any workspace → unique, sendable recipients, keeping the
    /// first entry per number and counting everything dropped.
    static func audience(from contacts: [Contact]) -> Audience {
        var seen = Set<String>()
        var recipients: [Recipient] = []
        var missingPhone = 0
        var invalidPhone = 0
        var duplicates = 0
        for contact in contacts {
            let raw = (contact.phone ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty { missingPhone += 1; continue }
            guard let phone = normalizeAUMobile(raw) else { invalidPhone += 1; continue }
            if seen.contains(phone) { duplicates += 1; continue }
            seen.insert(phone)
            let name = contact.name.trimmingCharacters(in: .whitespacesAndNewlines)
            recipients.append(
                Recipient(name: name.isEmpty ? raw : name, phone: phone, detail: contact.detail)
            )
        }
        return Audience(
            recipients: recipients,
            missingPhone: missingPhone,
            invalidPhone: invalidPhone,
            duplicates: duplicates
        )
    }

    /// nil when the campaign is safe to send, otherwise the reason it is not.
    static func validationMessage(message: String, recipients: [Recipient]) -> String? {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return "Write the message to send." }
        if text.count > maxMessageLength { return "SMS messages are limited to \(maxMessageLength) characters." }
        if recipients.isEmpty { return "Tick at least one recipient with a mobile number." }
        if recipients.count > maxRecipients { return "Send to at most \(maxRecipients) people per campaign." }
        if recipients.contains(where: { normalizeAUMobile($0.phone) == nil }) {
            return "A ticked recipient no longer has a valid Australian mobile."
        }
        return nil
    }
}
