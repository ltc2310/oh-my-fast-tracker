# Implementation Plan: Regex Parser Enhancement

## Overview

Enhance the `RegexParser` with a preprocessing pipeline (abbreviation expansion, spelling normalization, contextual emoji matching), expanded Vietnamese/English keywords, and cross-segment combination logic. The implementation builds incrementally: internal utilities first, then integration into the parsing pipeline, then cross-segment post-processing, and finally property-based tests for correctness guarantees.

## Tasks

- [x] 1. Add fast-check dependency and expand category keywords
  - [x] 1.1 Install fast-check and add expanded keywords to RegexParser
    - Run `npm install --save-dev fast-check` to add the PBT library
    - Add 15+ new Vietnamese keywords to CATEGORY_KEYWORDS in `src/infrastructure/parsers/RegexParser.ts` as specified in design (trà, nước, chè, bữa, gojek, be, tiki, online, gym, yoga, nhạc, show, sửa nhà, mobile, udemy, etc.)
    - Add English keywords (coffee already exists; add lunch, dinner, breakfast, parking, uber, rent, shopping, movie, electric, water, gym) to appropriate category positions
    - Ensure longer keywords appear before shorter keywords within each category array
    - Verify existing tests still pass with `npm test`
    - _Requirements: 1.1, 1.2, 1.5, 5.1, 5.2, 5.5, 8.5, 8.6_

- [x] 2. Implement abbreviation expansion
  - [x] 2.1 Create ABBREVIATION_MAP and expandAbbreviations function
    - Add `ABBREVIATION_MAP` constant to `src/infrastructure/parsers/RegexParser.ts` with mappings: cf→cà phê, cp→cà phê, dt→điện thoại, bv→bệnh viện, st→siêu thị, ks→khách sạn, nt→nhà thuốc
    - Implement `expandAbbreviations(text: string): string` that replaces standalone abbreviation tokens (word-boundary delimited) with their full forms, case-insensitively
    - Ensure abbreviations within longer tokens (e.g., "cfshop") are NOT expanded
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property tests for abbreviation expansion
    - **Property 4: Abbreviation Expansion Round-Trip**
    - **Property 5: Abbreviation Word-Boundary Safety**
    - **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
    - Create `test/parsers/regex-parser-pbt.spec.ts` with custom generators (arbKeyword, arbAmountStr, arbAbbreviation)

- [x] 3. Implement spelling normalization
  - [x] 3.1 Create normalizeSpelling function
    - Implement `normalizeSpelling(text: string): string` in `src/infrastructure/parsers/RegexParser.ts`
    - Apply word-initial consonant substitutions: f→ph, z→gi, w→qu
    - Apply d→gi only when the resulting word matches a known keyword
    - Only apply at word boundaries (start of string or preceded by whitespace)
    - Do NOT normalize characters at non-initial positions within words
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property tests for spelling normalization
    - **Property 6: Spelling Normalization Enables Keyword Match**
    - **Property 7: Normalization Word-Boundary Safety**
    - **Property 8: Normalization Graceful Fallback**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5**
    - Add custom generator `arbInformalSpelling` to the PBT test file

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement contextual pattern matching
  - [x] 5.1 Create CONTEXTUAL_PATTERNS and detectContextualCategory function
    - Add `CONTEXTUAL_PATTERNS` constant mapping categories to emoji/symbol arrays as defined in design
    - Implement `detectContextualCategory(text: string): string | null` that returns a category only when exactly one category matches; returns null for zero or multiple matches
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 5.2 Write property tests for contextual pattern matching
    - **Property 10: Contextual Indicator Confidence (Single-Category)**
    - **Property 11: Amount-Only Segments Default to Uncertain**
    - **Property 12: Ambiguous Context Escalates**
    - **Property 13: Keyword Priority Over Contextual Patterns**
    - **Validates: Requirements 4.1, 4.3, 4.5, 4.6**
    - Add custom generator `arbEmoji` to the PBT test file

- [x] 6. Integrate preprocessing pipeline into parseSingle
  - [x] 6.1 Wire abbreviation expansion, normalization, and contextual matching into parsing flow
    - Modify `parseSingle` in `src/infrastructure/parsers/RegexParser.ts` to apply pipeline: lowercase → abbreviation expansion → spelling normalization → keyword matching → contextual fallback
    - Amount extraction remains on original text (not normalized text)
    - Preserve original segment text in the `note` field
    - Keyword match takes priority over contextual pattern match
    - If no keyword and no contextual match → return "Khác" with confident=false
    - Ensure existing tests still pass
    - _Requirements: 1.3, 1.4, 3.6, 4.6, 5.3, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 6.2 Write property tests for pipeline integration
    - **Property 1: Keyword Match Guarantees Confidence**
    - **Property 2: Category Priority Ordering**
    - **Property 3: Longest Keyword Match**
    - **Property 9: Original Text Preservation in Note Field**
    - **Property 14: Vietnamese Keyword Priority Over English**
    - **Property 18: Normalization Does Not Affect Amount Extraction**
    - **Property 19: Backward Compatibility — Amount Preservation**
    - **Validates: Requirements 1.1, 1.3, 1.4, 3.6, 5.3, 7.1, 7.2, 8.2, 8.3, 8.5, 8.6**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement cross-segment combination
  - [x] 8.1 Create CROSS_SEGMENT_CONNECTORS and combineAdjacentSegments logic
    - Add `CROSS_SEGMENT_CONNECTORS` array: ["hết", "tốn", "mất", "trả", "chi", "xài", "tiêu"]
    - Implement `combineAdjacentSegments` post-processing step that links keyword-bearing segments (no amount) with adjacent amount-bearing segments (with connector verb)
    - Max 1 look-ahead for segment combination
    - Handle amount-first order within single segments (e.g., "200k ăn trưa")
    - Do NOT combine if no connector verb is present
    - Integrate into `parse` and `parseWithConfidence` methods after per-segment processing
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 8.2 Write property tests for cross-segment combination
    - **Property 15: Cross-Segment Combination With Connector**
    - **Property 16: Amount-First Order Independence**
    - **Property 17: No Connector Prevents Combination**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**

- [x] 9. Write unit tests for new functionality
  - [x] 9.1 Create example-based unit tests for abbreviation, normalization, and compound patterns
    - Create `test/parsers/regex-parser-abbrev.spec.ts` with tests for each abbreviation mapping (cf, cp, dt, bv, st, ks, nt), case insensitivity, and word-boundary safety
    - Create `test/parsers/regex-parser-normalize.spec.ts` with tests for each normalization rule (f→ph, z→gi, w→qu, conditional d→gi), word-boundary safety, and fallback behavior
    - Create `test/parsers/regex-parser-compound.spec.ts` with tests for cross-segment connectors, amount-first patterns, no-connector rejection, and multi-segment look-ahead boundary
    - Test English keyword mappings (lunch, dinner, gym, parking, uber, rent, shopping, movie, electric, water)
    - Test category priority ordering with mixed Vietnamese/English keywords
    - _Requirements: 2.2, 3.2, 5.2, 6.2, 6.6, 8.1, 8.5_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `fast-check` library (^3.22.0) is added as a dev dependency for property-based testing
- All preprocessing operates on a copy of the text; the original is always preserved in `note`
- The HybridParser requires no changes — it already uses the `confident` flag from RegexParser

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "5.2"] },
    { "id": 3, "tasks": ["6.1"] },
    { "id": 4, "tasks": ["6.2", "8.1"] },
    { "id": 5, "tasks": ["8.2", "9.1"] }
  ]
}
```
