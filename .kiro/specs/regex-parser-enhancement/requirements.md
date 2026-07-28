# Requirements Document

## Introduction

This feature enhances the RegexParser to confidently categorize a larger portion of Vietnamese expense messages, reducing the number of escalations to the AI parser (Gemini Flash) and thereby lowering API costs. The HybridParser currently sends the full message to AI whenever any segment lacks a confident category match. By expanding keyword coverage, handling common abbreviations and slang spellings, normalizing informal text, and improving confidence heuristics, the RegexParser can resolve more messages locally without AI assistance.

## Glossary

- **RegexParser**: The keyword-and-regex-based parser that categorizes Vietnamese expense messages without external API calls
- **HybridParser**: The orchestrator that tries RegexParser first and escalates to AIParser when confidence is insufficient
- **AIParser**: The Gemini Flash-powered parser used as fallback when RegexParser cannot confidently categorize
- **Confidence**: A boolean flag indicating whether RegexParser matched a known category for a given expense segment
- **Segment**: A single expense item within a multi-transaction message, separated by comma, semicolon, or newline
- **Abbreviation**: A shortened Vietnamese word commonly used in chat (e.g., "cf" for "cà phê", "dt" for "điện thoại")
- **Normalization**: The process of converting informal/slang spellings to standard Vietnamese before keyword matching
- **Escalation**: The event of HybridParser forwarding a message to AIParser due to low confidence from RegexParser

## Requirements

### Requirement 1: Expanded Category Keywords

**User Story:** As a user, I want the RegexParser to recognize more common Vietnamese expense terms, so that my everyday spending messages are categorized without AI intervention.

#### Acceptance Criteria

1. WHEN a message contains a keyword from the expanded keyword set for a given category, THE RegexParser SHALL assign that category and return confident status as true
2. THE RegexParser SHALL include at least 15 additional keywords distributed across a minimum of 5 existing categories, where each added keyword represents a common Vietnamese spending term not present in the current CATEGORY_KEYWORDS map
3. WHEN multiple keywords from different categories are present in a single segment, THE RegexParser SHALL select the category whose keyword list appears first in the priority-ordered CATEGORY_KEYWORDS array
4. WHEN an added keyword is a substring of another existing keyword in the same or different category, THE RegexParser SHALL match the longest keyword first to avoid false categorization
5. IF a segment contains only a newly added keyword and an amount but no other context, THEN THE RegexParser SHALL still assign the matching category with confident status as true

### Requirement 2: Vietnamese Abbreviation Expansion

**User Story:** As a user, I want to type common Vietnamese abbreviations in my expense messages, so that I can log expenses quickly without typing full words.

#### Acceptance Criteria

1. WHEN a message contains a recognized Vietnamese abbreviation as a standalone word (delimited by whitespace, start of string, or end of string), THE RegexParser SHALL expand the abbreviation to its full Vietnamese form before performing category matching
2. THE RegexParser SHALL support the following abbreviations at minimum: "cf" and "cp" for "cà phê", "dt" for "điện thoại", "bv" for "bệnh viện", "st" for "siêu thị", "ks" for "khách sạn", "nt" for "nhà thuốc"
3. IF an abbreviation appears as a substring within a longer sequence of non-whitespace characters (e.g., "cfshop", "abcdt"), THEN THE RegexParser SHALL not expand it
4. THE RegexParser SHALL match abbreviations case-insensitively against the input text, so that "CF 30k", "cf 30k", and "Cf 30k" all expand to "cà phê"
5. WHEN multiple abbreviations appear in a single message or segment, THE RegexParser SHALL expand each recognized abbreviation independently before category detection

### Requirement 3: Informal Spelling Normalization

**User Story:** As a user, I want to type expense messages using informal Vietnamese spellings, so that the parser understands my messages without requiring formal spelling.

#### Acceptance Criteria

1. WHEN a message contains informal Vietnamese spelling variants defined in criterion 2, THE RegexParser SHALL normalize them to standard form before keyword matching and after lowercasing
2. THE RegexParser SHALL normalize the following consonant substitutions at word-initial position: "f" to "ph" (e.g., "fở" → "phở"), "z" to "gi" (e.g., "zải trí" → "giải trí"), "w" to "qu" (e.g., "wần áo" → "quần áo"), and "d" to "gi" only when the resulting word matches a keyword in the category map (e.g., "dải trí" → "giải trí" matches "giải trí" keyword)
3. THE RegexParser SHALL apply normalization only to characters immediately following a word boundary, defined as the start of the string or a position preceded by whitespace, to avoid transforming characters within standard Vietnamese words
4. WHEN normalization produces a recognized keyword match, THE RegexParser SHALL assign the corresponding category with confident status set to true
5. IF normalization does not produce a recognized keyword match, THEN THE RegexParser SHALL fall back to the original un-normalized text for category detection and proceed with existing matching logic
6. THE RegexParser SHALL preserve the original user-typed text in the note field, not the normalized form

### Requirement 4: Context-Based Confidence Enhancement

**User Story:** As a user, I want the parser to confidently categorize my expenses even when an exact keyword match is not found, so that fewer messages escalate to the AI unnecessarily.

#### Acceptance Criteria

1. WHEN a segment contains a valid amount but no exact category keyword match, AND the segment contains at least one contextual indicator from the defined contextual patterns for a category, THE RegexParser SHALL assign that category with confident status
2. THE RegexParser SHALL define contextual patterns as a mapping of categories to lists of Unicode characters, emojis, or short symbolic tokens (e.g., 🍜🍚🥗🍺 for "Ăn uống", ⛽🚗 for "Di chuyển") that serve as non-keyword textual indicators for category assignment
3. WHEN a segment contains only a valid amount and no keyword match and no contextual indicator from any defined pattern, THE RegexParser SHALL assign "Khác" with not-confident status to preserve existing escalation behavior
4. THE RegexParser SHALL NOT mark a segment as confident based solely on amount value without at least one supporting textual indicator (keyword or contextual pattern match)
5. IF a segment matches contextual indicators for more than one category, THEN THE RegexParser SHALL assign "Khác" with not-confident status to escalate to AI rather than risk miscategorization
6. WHEN a segment contains an exact category keyword match, THE RegexParser SHALL prioritize the keyword match over any contextual pattern match and assign the keyword's category with confident status

### Requirement 5: Common English Keyword Support

**User Story:** As a user who mixes English and Vietnamese in messages, I want the parser to recognize common English spending terms, so that my mixed-language messages are categorized correctly.

#### Acceptance Criteria

1. WHEN a message contains a recognized English keyword, THE RegexParser SHALL assign the corresponding category with confident status set to true
2. THE RegexParser SHALL support at minimum these English keywords mapped to categories: "coffee" → Ăn uống, "lunch" → Ăn uống, "dinner" → Ăn uống, "breakfast" → Ăn uống, "gym" → Sức khỏe, "parking" → Di chuyển, "rent" → Nhà ở, "uber" → Di chuyển, "taxi" → Di chuyển, "shopping" → Mua sắm, "movie" → Giải trí, "gas" → Tiện ích, "electric" → Tiện ích, "water" → Tiện ích
3. WHEN an English keyword and a Vietnamese keyword both match within the same segment, THE RegexParser SHALL assign the category of the Vietnamese keyword, because Vietnamese keywords appear earlier in the CATEGORY_KEYWORDS priority order
4. THE RegexParser SHALL perform English keyword matching by comparing against the lowercased message text using substring inclusion (case-insensitive)
5. WHEN a message contains only an English keyword and an amount with no Vietnamese keyword match, THE RegexParser SHALL return confident status as true and assign the category mapped to that English keyword

### Requirement 6: Compound Expense Pattern Recognition

**User Story:** As a user, I want the parser to handle common compound patterns where the category context appears separate from the amount, so that messages like "đi ăn rồi, hết 200k" are categorized correctly.

#### Acceptance Criteria

1. WHEN a message is split into segments and a segment contains a category keyword but no valid amount, and an adjacent segment contains a valid amount but no category keyword, THE RegexParser SHALL combine the category from the keyword-bearing segment with the amount from the amount-bearing segment and return a single ParsedExpense with confident status
2. THE RegexParser SHALL recognize the following Vietnamese spending verbs as cross-segment connectors that link a preceding category segment to an amount segment: "hết", "tốn", "mất", "trả", "chi", "xài", "tiêu"
3. WHEN a cross-segment connector word in the amount-bearing segment also matches a category keyword, THE RegexParser SHALL use the category keyword from the keyword-bearing segment rather than the connector word's category
4. THE RegexParser SHALL handle segments where the amount precedes the keyword within the same segment (e.g., "200k ăn trưa") with the same confidence as keyword-first patterns
5. IF neither the keyword-bearing segment nor the adjacent amount-bearing segment contains a recognized cross-segment connector, THEN THE RegexParser SHALL NOT combine the segments and SHALL treat the amount segment as category "Khác" with confident status false
6. WHEN multiple segments each contain a category keyword without an amount, THE RegexParser SHALL associate each keyword-bearing segment only with the nearest adjacent segment that contains an amount and a cross-segment connector, processing a maximum of 1 segment look-ahead

### Requirement 7: Parser Round-Trip Consistency

**User Story:** As a developer, I want the enhanced RegexParser to produce the same results regardless of whether input goes through normalization and abbreviation expansion, so that the parsing pipeline is predictable.

#### Acceptance Criteria

1. WHEN the RegexParser categorizes a message segment with confident=true, THE RegexParser SHALL produce the same amount value and the same category string whether parsing the original text or parsing the text after normalization and abbreviation expansion have been applied
2. THE RegexParser SHALL store the original segment text (before any normalization or abbreviation expansion) in the note field of each ParsedExpense result
3. WHEN normalization or abbreviation expansion is applied to input text, THE RegexParser SHALL extract the same numeric amount as it would from the unnormalized text (normalization and expansion affect only category keyword matching, not amount extraction)
4. IF normalization or abbreviation expansion causes a previously unrecognized segment to match a category keyword, THEN THE RegexParser SHALL assign the matched category while preserving the original amount and original note text

### Requirement 8: Backward Compatibility

**User Story:** As a developer, I want the enhanced RegexParser to maintain full backward compatibility with existing behavior, so that no currently-working messages regress.

#### Acceptance Criteria

1. THE RegexParser SHALL pass all existing unit tests in `test/parsers/regex-parser.spec.ts` without modification to test assertions
2. WHEN a message was previously parsed by RegexParser with `confident: true`, THE enhanced RegexParser SHALL assign the same category and produce the same amount for that message
3. WHEN a message was previously parsed by RegexParser with `confident: false` (category "Khác"), THE enhanced RegexParser SHALL produce the same amount but MAY assign a different category
4. THE RegexParser SHALL maintain the same Parser interface contract: `parse(text: string): ParsedExpense[]` returning objects with fields `{ amount: number, category: string, note: string, date?: Date }`, and `parseWithConfidence(text: string): (ParsedExpense & { confident: boolean })[]`
5. THE RegexParser SHALL maintain the existing category priority order where categories are checked in this exact sequence: Tiết kiệm & Đầu tư > Thu nhập > Nhà ở > Tiện ích > Internet > Sức khỏe > Con cái > Chi phí cố định > Giáo dục > Giải trí > Di chuyển > Ăn uống > Mua sắm
6. WHEN the enhanced RegexParser adds new keywords to an existing category, THE RegexParser SHALL insert them such that longer keywords appear before shorter keywords within that category to preserve match specificity
