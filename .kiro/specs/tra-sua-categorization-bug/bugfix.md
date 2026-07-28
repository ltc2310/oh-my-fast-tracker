# Bugfix Requirements Document

## Introduction

Bug trong RegexParser: khi người dùng nhập "trà sữa", hệ thống phân loại sai vào nhóm "Con cái" thay vì nhóm "Ăn uống". Nguyên nhân là do trong mảng `CATEGORY_KEYWORDS`, nhóm "Con cái" chứa keyword "sữa" và được kiểm tra trước nhóm "Ăn uống" (nơi chứa keyword "trà sữa"). Hàm `detectCategory` duyệt theo thứ tự category, nên "sữa" khớp trước khi hệ thống đến được "trà sữa".

Ngoài ra, người dùng muốn thêm viết tắt "ts" để hệ thống nhận diện là "trà sữa" (thuộc nhóm Ăn uống).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN người dùng nhập "trà sữa 50k" THEN hệ thống phân loại vào nhóm "Con cái" thay vì "Ăn uống" (do keyword "sữa" trong "Con cái" khớp trước "trà sữa" trong "Ăn uống")

1.2 WHEN người dùng nhập viết tắt "ts 30k" THEN hệ thống không nhận diện được "trà sữa" và phân loại vào "Khác" (do "ts" chưa có trong ABBREVIATION_MAP)

### Expected Behavior (Correct)

2.1 WHEN người dùng nhập "trà sữa 50k" THEN hệ thống SHALL phân loại đúng vào nhóm "Ăn uống" với confident=true

2.2 WHEN người dùng nhập viết tắt "ts 30k" THEN hệ thống SHALL mở rộng "ts" thành "trà sữa" và phân loại vào nhóm "Ăn uống" với confident=true

### Unchanged Behavior (Regression Prevention)

3.1 WHEN người dùng nhập "sữa bỉm 100k" hoặc "bỉm 200k" hoặc "tã 150k" THEN hệ thống SHALL CONTINUE TO phân loại đúng vào nhóm "Con cái"

3.2 WHEN người dùng nhập "sữa 50k" (không có "trà" phía trước) THEN hệ thống SHALL CONTINUE TO phân loại vào nhóm "Con cái" (vì "sữa" đơn lẻ vẫn ám chỉ sữa cho bé)

3.3 WHEN người dùng nhập các viết tắt hiện có như "cf 30k", "dt 500k", "st 100k" THEN hệ thống SHALL CONTINUE TO mở rộng và phân loại đúng như trước

3.4 WHEN người dùng nhập các keyword khác trong nhóm "Ăn uống" như "cà phê 30k", "phở 50k", "cơm 40k" THEN hệ thống SHALL CONTINUE TO phân loại đúng vào nhóm "Ăn uống"

---

## Bug Condition (Structured Pseudocode)

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ExpenseText
  OUTPUT: boolean
  
  // Returns true when the input contains "trà sữa" (which incorrectly matches "sữa" in "Con cái" first)
  // OR when the input is abbreviation "ts" (which should map to "trà sữa" but currently has no mapping)
  RETURN X.normalized CONTAINS "trà sữa" OR X.rawToken = "ts"
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking - "trà sữa" categorization
FOR ALL X WHERE isBugCondition(X) DO
  result ← RegexParser'.parse(X)
  ASSERT result.category = "Ăn uống" AND result.confident = true
END FOR
```

### Preservation Checking Property

```pascal
// Property: Preservation Checking - "Con cái" items unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT RegexParser(X) = RegexParser'(X)
END FOR
```

Specifically:
```pascal
// "sữa" alone (without "trà" prefix) still maps to "Con cái"
FOR ALL X WHERE X.normalized CONTAINS "sữa" AND NOT (X.normalized CONTAINS "trà sữa") DO
  result ← RegexParser'(X)
  ASSERT result.category = "Con cái"
END FOR
```
