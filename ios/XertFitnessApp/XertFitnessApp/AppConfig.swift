import Foundation

enum AppConfig {
    static let apiRequestTimeout: TimeInterval = 20

    static var supabaseURL: URL {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let url = URL(string: raw),
            !raw.isEmpty
        else {
            return URL(string: "https://placeholder.supabase.co")!
        }
        return url
    }

    static var supabaseAnonKey: String {
        Bundle.main.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String ?? "placeholder"
    }

    static var vercelBaseURL: URL {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "VERCEL_BASE_URL") as? String,
            let url = normalizedWebBaseURL(raw)
        else {
            return URL(string: "https://example.com")!
        }
        return url
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
}
