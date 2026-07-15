import AuthenticationServices
import SwiftUI
import UIKit

enum CheckoutBrowserError: LocalizedError {
    case alreadyPresenting
    case couldNotStart
    case cancelled
    case missingCallback

    var errorDescription: String? {
        switch self {
        case .alreadyPresenting:
            return "A checkout is already open."
        case .couldNotStart:
            return "Secure checkout could not open. Please try again."
        case .cancelled:
            return "Checkout was closed."
        case .missingCallback:
            return "Checkout closed without a verified return to XERT. Your payment status will continue refreshing."
        }
    }
}

@MainActor
final class CheckoutBrowser: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    @Published private(set) var isPresenting = false
    private var session: ASWebAuthenticationSession?

    func start(
        url: URL,
        completion: @escaping (Result<URL, CheckoutBrowserError>) -> Void
    ) {
        guard session == nil else {
            completion(.failure(.alreadyPresenting))
            return
        }

        let checkoutSession = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: "xertfitness"
        ) { [weak self] callbackURL, error in
            Task { @MainActor in
                self?.session = nil
                self?.isPresenting = false

                if let callbackURL, CheckoutDeepLink.status(from: callbackURL) != nil {
                    completion(.success(callbackURL))
                    return
                }
                if let authenticationError = error as? ASWebAuthenticationSessionError,
                   authenticationError.code == .canceledLogin {
                    completion(.failure(.cancelled))
                    return
                }
                completion(.failure(.missingCallback))
            }
        }
        checkoutSession.presentationContextProvider = self
        checkoutSession.prefersEphemeralWebBrowserSession = false
        session = checkoutSession
        isPresenting = true

        guard checkoutSession.start() else {
            session = nil
            isPresenting = false
            completion(.failure(.couldNotStart))
            return
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
            ?? ASPresentationAnchor()
    }
}
