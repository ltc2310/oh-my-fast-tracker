# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - "trà sữa" Miscategorized as "Con cái"
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to concrete failing cases: inputs containing "trà sữa" and the abbreviation "ts"
  - Test file: `test/parsers/regex-parser.spec.ts`
  - Test that `detectCategory("trà sữa 50k")` returns "Ăn uống" (will FAIL with "Con cái" on unfixed code)
  - Test that `parser.parse("ts 30k")` returns category "Ăn uống" (will FAIL with "Khác" on unfixed code since "ts" not in ABBREVIATION_MAP)
  - Test that `detectCategory("uống trà sữa hết 35k")` returns "Ăn uống" (will FAIL with "Con cái" on unfixed code)
  - Test that `parser.parseWithConfidence("trà sữa 50k")` returns confident=true with category "Ăn uống"
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found: `detectCategory("trà sữa 50k")` → "Con cái" instead of "Ăn uống" due to "sữa" matching in "Con cái" (index 6) before "trà sữa" in "Ăn uống" (index 11)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - "sữa" Alone Still Maps to "Con cái"
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `test/parsers/regex-parser.spec.ts`
  - Observe: `detectCategory("sữa 50k")` returns "Con cái" on unfixed code
  - Observe: `detectCategory("sữa bỉm 100k")` returns "Con cái" on unfixed code
  - Observe: `detectCategory("bỉm cho bé 200k")` returns "Con cái" on unfixed code
  - Observe: `detectCategory("tã 150k")` returns "Con cái" on unfixed code
  - Observe: `detectCategory("cà phê 30k")` returns "Ăn uống" on unfixed code
  - Observe: `detectCategory("phở 50k")` returns "Ăn uống" on unfixed code
  - Observe: `parser.parse("cf 30k")` returns category "Ăn uống" (existing abbreviation still works)
  - Observe: `parser.parse("dt 500k")` returns category "Internet" (existing abbreviation still works)
  - Write property-based tests: for all inputs where text contains "sữa" but NOT "trà sữa", result category equals "Con cái"
  - Write property-based tests: for all existing abbreviations (cf, cp, dt, bv, st, ks, nt), expansion and categorization remain unchanged
  - Write property-based tests: for all other category keywords (cà phê, phở, cơm, xăng, grab, etc.), detectCategory returns the same result as before
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for "trà sữa" categorization bug

  - [x] 3.1 Add "ts" → "trà sữa" to ABBREVIATION_MAP
    - In `src/infrastructure/parsers/RegexParser.ts`, add `ts: "trà sữa"` to the `ABBREVIATION_MAP` object
    - _Bug_Condition: isBugCondition(input) where input.rawToken = "ts" has no mapping_
    - _Expected_Behavior: expandAbbreviations("ts") returns "trà sữa"_
    - _Requirements: 2.2_

  - [x] 3.2 Implement global longest-match logic in detectCategory
    - In `src/infrastructure/parsers/RegexParser.ts`, replace the current `detectCategory` function
    - Current logic: iterates categories in order, returns FIRST category with any matching keyword
    - Fixed logic: iterates ALL categories and ALL keywords, tracks the longest matching keyword globally, returns the category with the longest match
    - This ensures "trà sữa" (7 chars) beats "sữa" (3 chars) regardless of category order
    - _Bug_Condition: isBugCondition(input) where normalized text CONTAINS "trà sữa" but "sữa" in "Con cái" matches first due to category order_
    - _Expected_Behavior: detectCategory returns category with globally longest keyword match_
    - _Preservation: All non-"trà sữa" inputs produce identical results since longest-match preserves existing behavior when no cross-category conflict exists_
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - "trà sữa" Correctly Categorized as "Ăn uống"
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - "sữa" Alone Still Maps to "Con cái"
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run full test suite: `npx jest test/parsers/regex-parser.spec.ts`
  - Ensure all existing tests still pass (no regressions in amount parsing, date detection, multi-transaction, slang units, etc.)
  - Ensure all new bug condition and preservation tests pass
  - Ask the user if questions arise
