struct MemberStateVersion {
    private(set) var value = 0

    var snapshot: Int { value }

    mutating func invalidate() {
        value &+= 1
    }

    func isCurrent(_ snapshot: Int) -> Bool {
        value == snapshot
    }
}
