const LUT_SIZE: usize = 32;
const Q: i32 = 1 << 16; // Q16.16 fixed point scaling

// Precompute reciprocals of powers of two
// LUT[k] = Q / (1 << k)
const fn make_recip_lut() -> [i32; LUT_SIZE] {
    let mut lut = [0; LUT_SIZE];
    let mut i = 0;
    let mut n: u64 = 2;
    while i < LUT_SIZE {
        // This division happens *at compile time*, not runtime
        let mut val = (Q as u64).pow(2) / n;
        if val > 2147483647 {
          val = 2147483647;
        }
        lut[i] = val as i32;
        i += 1;
        n = n << 1;
    }
    lut
}

const RECIP_LUT: [i32; LUT_SIZE] = make_recip_lut();

/// Fast reciprocal using log2 bucketed LUT, no runtime division
pub fn recip(x: i32) -> i32 {
    assert!(x > 0);

    // Find highest set bit
    let lz = x.leading_zeros();
    let idx = 31 - lz as usize;       // log2 bucket
    let base = 1 << idx;     // power-of-two anchor

    // Fractional offset within bucket, in Q16
    let frac = ((((x - base) as u64) << 16) >> idx) as i32;

    // Lookup base reciprocal
    let r0 = RECIP_LUT[idx - 1];

    // Linear interpolation toward next reciprocal
    let shift = (idx as i32) - 16;
    let shift_left = shift.max(0) as u32;
    let shift_right = -shift.min(0) as u32;
    let correction = frac << shift_right >> shift_left >> 1;

    r0 - correction
}

pub fn send_lut() -> [i32; LUT_SIZE] {
  RECIP_LUT
}