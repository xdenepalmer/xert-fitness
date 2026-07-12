import Foundation

enum AppConfig {
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
            let url = URL(string: raw),
            !raw.isEmpty
        else {
            return URL(string: "https://example.com")!
        }
        return url
    }

    static func webURL(path: String) -> URL {
        guard !path.isEmpty else { return vercelBaseURL }
        return vercelBaseURL.appendingPathComponent(path)
    }
}
