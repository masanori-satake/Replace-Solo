## 2025-05-18 - Safe Property Lookup for User-Controlled Dictionary Keys

**Vulnerability:** Calling `obj.hasOwnProperty(key)` directly on JavaScript objects containing user-controlled string keys (such as dictionary replacement targets) allows a property named `"hasOwnProperty"` to shadow the method and can cause a `TypeError`. This is distinct from prototype pollution, which can occur when assigning a user-controlled `"__proto__"` key to a plain object.
**Learning:** `Object.prototype.hasOwnProperty.call(obj, key)` and `Object.hasOwn(obj, key)` provide safe own-property checks and address method shadowing, but they do not prevent `"__proto__"` assignments from changing an object's prototype.
**Prevention:** Use one of these safe own-property checks for arbitrary dynamic keys, and explicitly reject `"__proto__"` before assigning user-controlled keys to plain objects.
