// Transform displacement color channel value to unsigned offset using bit manipulation
pub fn bmpc_shift(a: u8) -> i8 {
  unsafe { std::mem::transmute::<u8, i8>(a ^ 128) }
}
// Transform a signed offset to displacement color channel value using bit manipulation
pub fn bmpc_unshift(a: i8) -> u8 {
  unsafe { std::mem::transmute::<i8, u8>(a) ^ 128 }
}

// (Approximately) Scale a u8 value using another u8 value as the alpha
// Good for quick color channel multiplication
pub fn approx_multiply_u8(a: u8, b: u8) -> u8 {
  cheap_divide_255((a as u16) * (b as u16)) as u8
}

pub fn cheap_divide_255(x: u16) -> u16 {
  (x + 1 + (x >> 8)) >> 8
}

// Interpolate between two u8 values using a u8 value as the alpha
pub fn interpolate_u8_with_u8(a: u8, b: u8, alpha: u8) -> u8 {
  let a: u16 = a.into();
  let b: u16 = b.into();
  let alpha: u16  = alpha.into();
  let result = (a * (255 - alpha) + b * alpha) >> 8;
  (result + 1) as u8
}