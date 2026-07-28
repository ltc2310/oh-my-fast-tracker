# Trà Sữa Categorization Bug - Bugfix Design

## Overview

Bug trong hàm `detectCategory` của RegexParser: input "trà sữa" bị phân loại sai vào "Con cái" thay vì "Ăn uống". Nguyên nhân là `detectCategory` duyệt categories theo thứ tự khai báo, và "Con cái" (chứa keyword "sữa") nằm trước "Ăn uống" (chứa keyword "trà sữa"). Khi text chứa "trà sữa", substring "sữa" khớp trước khi hệ thống kiểm tra đến category "Ăn uống".

Fix approach: thay đổi logic matching trong `detectCategory` để ưu tiên longest-match across ALL categories, đảm bảo "trà sữa" (7 chars) thắng "sữa" (3 chars) bất kể thứ tự category. Đồng thời thêm "ts" vào `ABBREVIATION_MAP`.

## Glossary

- **Bug_Condition (C)**: Input chứa "trà sữa" hoặc abbreviation "ts" - bị phân loại sai hoặc không nhận diện được
- **Property (P)**: Hành vi đúng khi C(X) = true: phân loại vào "Ăn uống" với confident=true
- **Preservation**: Hành vi hiện tại cho input KHÔNG thuộc bug condition phải giữ nguyên - đặc biệt "sữa" đơn lẻ vẫn thuộc "Con cái"
- **detectCategory**: Hàm trong `src/infrastructure/parsers/RegexParser.ts` xác định category dựa trên keyword matching
- **CATEGORY_KEYWORDS**: Mảng ordered tuples `[categoryName, keywords[]]` dùng cho keyword matching
- **ABBREVIATION_MAP**: Dictionary mapping viết tắt → full form, dùng trong `expandAbbreviations`

## Bug Details

### Bug Condition

Bug xảy ra khi người dùng nhập text chứa "trà sữa" (một đồ uống phổ biến). Hàm `detectCategory` duyệt `CATEGORY_KEYWORDS` theo thứ tự, kiểm tra từng category xem có keyword nào match trong text. "Con cái" (index 6) được kiểm tra trước "Ăn uống" (index 11), và keyword "sữa" trong "Con cái" là substring của "trà sữa", nên match đầu tiên.

Mặc dù mỗi category đã sort keywords theo length giảm dần (`sorted = [...keywords].sort((a, b) => b.length - a.length)`), việc sort này chỉ trong CÙNG MỘT category. Không có so sánh cross-category nào để ưu tiên match dài hơn.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ExpenseText (raw user message)
  OUTPUT: boolean
  
  normalized := lowercase(expandAbbreviations(input))
  
  RETURN normalized CONTAINS "trà sữa"
         OR rawTokenOf(input) = "ts"
END FUNCTION
```

### Examples

- Input: "trà sữa 50k" → Current: category="Con cái" (WRONG) → Expected: category="Ăn uống"
- Input: "ts 30k" → Current: category="Khác", confident=false (WRONG) → Expected: expand "ts"→"trà sữa", category="Ăn uống"
- Input: "uống trà sữa hết 35k" → Current: category="Con cái" (WRONG) → Expected: category="Ăn uống"
- Input: "sữa 50k" → Current: category="Con cái" (CORRECT) → Expected: category="Con cái" (unchanged)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- "sữa" đơn lẻ (không có "trà" phía trước) vẫn phân loại vào "Con cái"
- "sữa bỉm", "bỉm", "tã" vẫn phân loại đúng vào "Con cái"
- Tất cả keyword khác trong "Ăn uống" (cà phê, phở, cơm, bún, etc.) vẫn hoạt động đúng
- Các abbreviation hiện có (cf, cp, dt, bv, st, ks, nt) vẫn expand và phân loại đúng
- Thứ tự ưu tiên các category KHÁC không bị ảnh hưởng
- Mouse click, emoji detection, date detection, amount parsing không bị ảnh hưởng

**Scope:**
Tất cả input KHÔNG chứa "trà sữa" và KHÔNG phải abbreviation "ts" sẽ KHÔNG bị ảnh hưởng bởi fix này. Cụ thể:
- Input với keyword "sữa" mà KHÔNG có "trà" đứng trước
- Input với các keyword khác trong mọi category
- Input không match keyword nào (fallback "Khác")
- Input sử dụng emoji detection

## Hypothesized Root Cause

Based on code analysis, the root causes are:

1. **Category Order Dependency**: `detectCategory` iterates `CATEGORY_KEYWORDS` array sequentially and returns the FIRST category with any matching keyword. "Con cái" (index 6) is checked before "Ăn uống" (index 11), so "sữa" matches in "Con cái" before the system reaches "trà sữa" in "Ăn uống".

2. **No Cross-Category Longest-Match Logic**: The current `detectCategory` sorts keywords by length WITHIN each category (`[...keywords].sort((a, b) => b.length - a.length)`), but does not compare match lengths ACROSS categories. A 3-char match in an earlier category wins over a 7-char match in a later category.

3. **Missing Abbreviation**: "ts" is not in `ABBREVIATION_MAP`, so `expandAbbreviations("ts")` returns "ts" unchanged. Without expansion, no keyword matches and the result falls to "Khác".

## Correctness Properties

Property 1: Bug Condition - "trà sữa" Categorized as "Ăn uống"

_For any_ input where the text contains "trà sữa" (either directly or via abbreviation expansion of "ts"), the fixed `detectCategory` function SHALL return "Ăn uống", and the full parse pipeline SHALL produce `category="Ăn uống"` with `confident=true`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation - "sữa" Alone Still Maps to "Con cái"

_For any_ input where the text contains "sữa" but does NOT contain "trà sữa" (i.e., "sữa" appears without "trà" immediately preceding it), the fixed `detectCategory` function SHALL produce the same result as the original function, preserving the "Con cái" categorization for standalone "sữa" and related baby items.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/infrastructure/parsers/RegexParser.ts`

**Function**: `detectCategory`

**Specific Changes**:

1. **Implement Global Longest-Match Logic**: Modify `detectCategory` to find the longest matching keyword across ALL categories, not just return the first category with any match. This ensures "trà sữa" (7 chars) beats "sữa" (3 chars) regardless of category order.

   Current logic:
   ```typescript
   function detectCategory(text: string): string | null {
     const lower = text.toLowerCase();
     for (const [category, keywords] of CATEGORY_KEYWORDS) {
       const sorted = [...keywords].sort((a, b) => b.length - a.length);
       if (sorted.some((kw) => lower.includes(kw))) {
         return category;
       }
     }
     return null;
   }
   ```

   Fixed logic:
   ```typescript
   function detectCategory(text: string): string | null {
     const lower = text.toLowerCase();
     let bestCategory: string | null = null;
     let bestLength = 0;

     for (const [category, keywords] of CATEGORY_KEYWORDS) {
       for (const kw of keywords) {
         if (kw.length > bestLength && lower.includes(kw)) {
           bestLength = kw.length;
           bestCategory = category;
         }
       }
     }

     return bestCategory;
   }
   ```

2. **Add "ts" to ABBREVIATION_MAP**: Add mapping `ts: "trà sữa"` so that `expandAbbreviations("ts")` produces "trà sữa" which then matches the "Ăn uống" category.

   ```typescript
   const ABBREVIATION_MAP: Record<string, string> = {
     cf: "cà phê",
     cp: "cà phê",
     dt: "điện thoại",
     bv: "bệnh viện",
     st: "siêu thị",
     ks: "khách sạn",
     nt: "nhà thuốc",
     ts: "trà sữa",  // NEW
   };
   ```

3. **No Change to CATEGORY_KEYWORDS Order**: The category array order no longer matters for correctness since the new logic picks the globally longest match. No reordering needed.

4. **No Change to Other Functions**: `expandAbbreviations`, `normalizeSpelling`, `parseSingle`, `detectContextualCategory` remain unchanged.

5. **Performance Consideration**: The new logic iterates all keywords in all categories (instead of short-circuiting). Given the small size of `CATEGORY_KEYWORDS` (~150 keywords total), this has negligible performance impact.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that call `detectCategory` and the full `parse` pipeline with "trà sữa" inputs. Run these tests on the UNFIXED code to observe that they return "Con cái" instead of "Ăn uống".

**Test Cases**:
1. **Direct "trà sữa" Test**: `detectCategory("trà sữa 50k")` returns "Con cái" (will fail assertion for "Ăn uống" on unfixed code)
2. **"ts" Abbreviation Test**: Parse "ts 30k" → falls to "Khác" because "ts" isn't expanded (will fail on unfixed code)
3. **Sentence Context Test**: `detectCategory("uống trà sữa hết 35k")` returns "Con cái" (will fail on unfixed code)
4. **Mixed Input Test**: `detectCategory("mua sữa và trà sữa")` → demonstrates which match wins (will fail on unfixed code)

**Expected Counterexamples**:
- `detectCategory("trà sữa 50k")` → "Con cái" (should be "Ăn uống")
- Root cause confirmed: "sữa" in "Con cái" matched before "trà sữa" in "Ăn uống" due to category order

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := detectCategory_fixed(normalize(input))
  ASSERT result = "Ăn uống"
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT detectCategory_original(input) = detectCategory_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases where the longest-match logic might accidentally change behavior
- It provides strong guarantees that "sữa" alone still maps to "Con cái"
- It verifies that all other categories are unaffected by the logic change

**Test Plan**: Observe behavior on UNFIXED code first for non-"trà sữa" inputs, then write property-based tests capturing that behavior.

**Test Cases**:
1. **"sữa" Alone Preservation**: Verify `detectCategory("sữa 50k")` still returns "Con cái" after fix
2. **Other "Con cái" Keywords**: Verify "bỉm", "tã", "đồ chơi" still return "Con cái"
3. **Other "Ăn uống" Keywords**: Verify "cà phê", "phở", "cơm" still return "Ăn uống"
4. **Existing Abbreviations**: Verify "cf", "cp", "dt", "bv", "st" still expand and categorize correctly

### Unit Tests

- Test `detectCategory` with "trà sữa" → asserts "Ăn uống"
- Test `detectCategory` with "sữa" alone → asserts "Con cái"
- Test `expandAbbreviations("ts")` → asserts "trà sữa"
- Test full parse pipeline with "ts 30k" → asserts category="Ăn uống", amount=30000
- Test edge case: "sữa trà" (reversed order) → asserts based on longest match

### Property-Based Tests

- Generate random expense texts containing "trà sữa" with various amounts and verify category is always "Ăn uống"
- Generate random expense texts with "sữa" (without preceding "trà") and verify category is always "Con cái"
- Generate random keywords from ALL categories and verify `detectCategory` results are unchanged vs. original behavior
- Generate random abbreviation inputs and verify expansion + categorization pipeline works correctly

### Integration Tests

- Test full `RegexParser.parse("trà sữa 50k")` → amount=50000, category="Ăn uống"
- Test full `RegexParser.parse("ts 30k")` → amount=30000, category="Ăn uống"
- Test compound message: `RegexParser.parse("trà sữa 50k, sữa bỉm 200k")` → first="Ăn uống", second="Con cái"
- Test `RegexParser.parseWithConfidence("ts 35k")` → confident=true, category="Ăn uống"
