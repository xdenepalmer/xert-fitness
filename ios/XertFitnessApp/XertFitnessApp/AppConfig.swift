import Foundation

enum AppConfig {
    static let apiRequestTimeout: TimeInterval = 20
    static let supabaseHost = "ugmkwoapjcpiucsrxwzt.supabase.co"
    static let vercelHost = "xert-fitness.vercel.app"
    private static let unavailableURL = URL(string: "https://invalid.xert.invalid")!

    static var supabaseURL: URL {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = canonicalServiceURL(raw, expectedHost: supabaseHost)
        else {
            return unavailableURL
        }
        return url
    }

    static var supabaseAnonKey: String {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            isPublicSupabaseKey(raw)
        else { return "unavailable" }
        return raw
    }

    static var vercelBaseURL: URL {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "VERCEL_BASE_URL") as? String,
            let url = canonicalServiceURL(raw, expectedHost: vercelHost)
        else {
            return unavailableURL
        }
        return url
    }

    static func isTrustedServiceBaseURL(_ url: URL) -> Bool {
        canonicalServiceURL(url.absoluteString, expectedHost: supabaseHost) != nil
            || canonicalServiceURL(url.absoluteString, expectedHost: vercelHost) != nil
    }

    static func webURL(path: String) -> URL {
        webURL(baseURL: vercelBaseURL, path: path)
    }

    static func webURL(baseURL: URL, path: String) -> URL {
        guard !path.isEmpty else { return baseURL }
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return baseURL
        }
        let cleanPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/\(cleanPath)"
        components.query = nil
        components.fragment = nil
        return components.url ?? baseURL
    }

    static func normalizedWebBaseURL(_ rawValue: String) -> URL? {
        let raw = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return nil }
        if !raw.contains("://"), URLComponents(string: raw)?.scheme != nil {
            return nil
        }
        let candidate = raw.contains("://") ? raw : "https://\(raw)"
        guard
            var components = URLComponents(string: candidate),
            let scheme = components.scheme?.lowercased(),
            scheme == "https" || scheme == "http",
            components.host != nil
        else {
            return nil
        }
        components.scheme = scheme
        components.query = nil
        components.fragment = nil
        return components.url
    }

    static func canonicalServiceURL(_ rawValue: String, expectedHost: String) -> URL? {
        guard
            !rawValue.isEmpty,
            rawValue == rawValue.trimmingCharacters(in: .whitespacesAndNewlines),
            rawValue.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
            var components = URLComponents(string: rawValue),
            components.scheme?.lowercased() == "https",
            components.host?.lowercased() == expectedHost.lowercased(),
            components.port == nil,
            components.user == nil,
            components.password == nil,
            components.query == nil,
            components.fragment == nil,
            components.path.isEmpty || components.path == "/"
        else { return nil }
        components.scheme = "https"
        components.host = expectedHost.lowercased()
        components.path = ""
        return components.url
    }

    static func isPublicSupabaseKey(_ rawValue: String) -> Bool {
        guard
            !rawValue.isEmpty,
            rawValue == rawValue.trimmingCharacters(in: .whitespacesAndNewlines),
            rawValue.rangeOfCharacter(from: .whitespacesAndNewlines) == nil
        else { return false }

        if rawValue.hasPrefix("sb_secret_") { return false }
        if rawValue.hasPrefix("sb_publishable_") {
            let suffix = rawValue.dropFirst("sb_publishable_".count)
            let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
            return suffix.count >= 20
                && suffix.unicodeScalars.allSatisfy { allowed.contains($0) }
        }

        let parts = rawValue.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return false }
        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        payload += String(repeating: "=", count: (4 - payload.count % 4) % 4)
        guard
            let data = Data(base64Encoded: payload),
            let object = try? JSONSerialization.jsonObject(with: data),
            let claims = object as? [String: Any]
        else { return false }
        return claims["role"] as? String == "anon"
    }
}
