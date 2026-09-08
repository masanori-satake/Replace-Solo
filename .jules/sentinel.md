## 2025-05-18 - Safe Property Lookup for User-Controlled Dictionary Keys

**Vulnerability:** Calling `obj.hasOwnProperty(key)` directly on JavaScript objects containing user-controlled string keys (such as dictionary replacement targets) presents a property shadowing or prototype pollution lookup risk if `key` is `"hasOwnProperty"`.
**Learning:** When user input or dynamic keys are checked against plain JavaScript objects, calling `.hasOwnProperty(...)` directly can crash or behave unexpectedly if the object has a property named `hasOwnProperty`.
**Prevention:** Always use `Object.prototype.hasOwnProperty.call(obj, key)` or `Object.hasOwn(obj, key)` when checking properties on objects with arbitrary dynamic keys.
