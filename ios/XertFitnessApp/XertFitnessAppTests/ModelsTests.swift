import XCTest
@testable import XertFitness

final class ModelsTests: XCTestCase {
    func testProductDecodesTheWebSessionCountColumn() throws {
        let data = """
        {
          "slug": "starter-4",
          "name": "4 Class Starter Pack",
          "description": "A training block",
          "sessions_count": 4,
          "price_cents": 4800,
          "active": true,
          "sort_order": 2
        }
        """.data(using: .utf8)!

        let product = try JSONDecoder().decode(Product.self, from: data)

        XCTAssertEqual(product.sessionsCount, 4)
        XCTAssertEqual(product.price_cents, 4800)
    }

    func testCreditBatchDecodesTheDatabaseTotalColumn() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "total": 10,
          "remaining": 7,
          "expires_at": null
        }
        """.data(using: .utf8)!

        let batch = try JSONDecoder().decode(CreditBatch.self, from: data)

        XCTAssertEqual(batch.total, 10)
        XCTAssertEqual(batch.remaining, 7)
    }

    func testMemberProfileDecodesTheWebProfileColumns() throws {
        let data = """
        {
          "id": "C5747DAD-2E89-4D55-AD63-5732D8D67A60",
          "full_name": "Alex Runner",
          "phone": "0400 123 456",
          "email": "alex@example.com"
        }
        """.data(using: .utf8)!

        let profile = try JSONDecoder().decode(MemberProfile.self, from: data)

        XCTAssertEqual(profile.full_name, "Alex Runner")
        XCTAssertEqual(profile.phone, "0400 123 456")
    }

    func testFallbackCalendarCarriesTheFull2026Program() {
        XCTAssertEqual(XertEventCalendar.fallback.count, 20)
        XCTAssertEqual(XertEventCalendar.fallback.first?.name, "Gold Coast Marathon")
        XCTAssertEqual(XertEventCalendar.fallback.last?.name, "XERT Team Competition")
    }
}
