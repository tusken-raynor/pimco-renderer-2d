use super::utils::{approx_multiply_u8, bmpc_shift, interpolate_u8_with_u8};

pub fn apply_displacement_to_buffer(
    image: Vec<u8>,
    displacement: Vec<u8>,
    width: usize,
    height: usize,
    scalex: f32,
    scaley: f32,
) -> Vec<u8> {
    let mut buffer: Vec<u8> = vec![0; width * height * 4];

    let x_max = width as i32 - 1;
    let y_max = height as i32 - 1;

    // We are going to convert scale values to fixed point so we can use bit shifting
    let scalex = (scalex * 65536.0) as i32;
    let scaley = (scaley * 65536.0) as i32;

    for y in 0..height {
        // Calc the row in the outer loop to avoid doing a multiplication in the inner loop
        let row = y * width;
        let y_fixed = (y as i32) << 16;
        for x in 0..width {
            // Multiply the row by 4 (<< 2) to get the RGBA pixel index
            let idx = (row + x) << 2;
            let x_fixed = (x as i32) << 16;

            // If the blue channel is 0, then ignore this pixel
            if displacement[idx + 2] == 0 {
                continue;
            }
            // Convert the red and green channels to signed offsets
            let offset_x = bmpc_shift(displacement[idx]) as i32;
            let offset_y = bmpc_shift(displacement[idx + 1]) as i32;
            // Multiply the scales by the offsets and shift the results back to fixed
            // space before adding the offsets to the x and y fixed values
            let new_x = ((offset_x * -scalex) >> 7) + x_fixed;
            let new_y = ((offset_y * -scaley) >> 7) + y_fixed;
            let dec_x = ((new_x & 0xffff) >> 8) as u8;
            let dec_y = ((new_y & 0xffff) >> 8) as u8;
            // Now that we've captured the 'decimal' portion of the fixed point values,
            // and stored them in u8 integers, we can shift the new x and y values down
            // into pixel coordinate space. Clamp the values and convert back to usize
            let new_x = (new_x >> 16).clamp(0, x_max) as usize;
            let new_y = (new_y >> 16).clamp(0, y_max) as usize;
            // The lowest 4 bits of the blue channel is the alpha
            // Multiply this value by the alpha we get from the sample
            let alpha = (displacement[idx + 2] & 0xf) << 4;

            let result = bilinear_sample(&image, width, height, new_x, new_y, dec_x, dec_y);
            // let d_idx = (new_y * width + new_x) << 2;
            // let result = [image[d_idx], image[d_idx + 1], image[d_idx + 2], image[d_idx + 3]];

            buffer[idx] = result[0];
            buffer[idx + 1] = result[1];
            buffer[idx + 2] = result[2];
            buffer[idx + 3] = approx_multiply_u8(result[3], alpha);
        }
    }

    buffer
}

fn bilinear_sample(
    image: &[u8],
    width: usize,
    height: usize,
    x0: usize,
    y0: usize,
    alpha_x: u8,
    alpha_y: u8,
) -> [u8; 4] {
    let x1 = x0 + 1;
    let y1 = y0 + 1;

    let x0 = x0.clamp(0, width - 1);
    let x1 = x1.clamp(0, width - 1);
    let y0 = y0.clamp(0, height - 1);
    let y1 = y1.clamp(0, height - 1);

    let y0_x_width = y0 * width;
    let y1_x_width = y1 * width;
    let idx00 = (x0 + y0_x_width) << 2;
    let idx01 = (x0 + y1_x_width) << 2;
    let idx10 = (x1 + y0_x_width) << 2;
    let idx11 = (x1 + y1_x_width) << 2;
    
    let r00 = image[idx00];
    let r01 = image[idx01];
    let r10 = image[idx10];
    let r11 = image[idx11];

    let g00 = image[idx00 + 1];
    let g01 = image[idx01 + 1];
    let g10 = image[idx10 + 1];
    let g11 = image[idx11 + 1];

    let b00 = image[idx00 + 2];
    let b01 = image[idx01 + 2];
    let b10 = image[idx10 + 2];
    let b11 = image[idx11 + 2];

    let a00 = image[idx00 + 3];
    let a01 = image[idx01 + 3];
    let a10 = image[idx10 + 3];
    let a11 = image[idx11 + 3];

    let r0 = interpolate_u8_with_u8(r00, r10, alpha_x);
    let r1 = interpolate_u8_with_u8(r01, r11, alpha_x);
    
    let g0 = interpolate_u8_with_u8(g00, g10, alpha_x);
    let g1 = interpolate_u8_with_u8(g01, g11, alpha_x);

    let b0 = interpolate_u8_with_u8(b00, b10, alpha_x);
    let b1 = interpolate_u8_with_u8(b01, b11, alpha_x);

    let a0 = interpolate_u8_with_u8(a00, a10, alpha_x);
    let a1 = interpolate_u8_with_u8(a01, a11, alpha_x);

    let r = interpolate_u8_with_u8(r0, r1, alpha_y);
    let g = interpolate_u8_with_u8(g0, g1, alpha_y);
    let b = interpolate_u8_with_u8(b0, b1, alpha_y);
    let a = interpolate_u8_with_u8(a0, a1, alpha_y);

    [r, g, b, a]
}

// This is the version of the function that uses floating point values and division operations
// It is more straightforward, but it is also slower
pub fn _apply_displacement_to_buffer_float(
  image: Vec<u8>,
  displacement: Vec<u8>,
  width: usize,
  height: usize,
  scalex: f32,
  scaley: f32,
) -> Vec<u8> {
  let mut buffer: Vec<u8> = vec![0; width * height * 4];

  let width_f32 = width as f32;
  let height_f32 = height as f32;

  for y in 0..height {
      // Calc the row in the outer loop to avoid doing a multiplication in the inner loop
      let row = y * width;
      for x in 0..width {
          // Multiply the row by 4 (<< 2) to get the RGBA pixel index
          let idx = (row + x) << 2;

          // If the blue channel is 0, then ignore this pixel
          if displacement[idx + 2] == 0 {
              continue;
          }
          let offset_x = ((displacement[idx] as f32 - 127.0) / 127.0) * -scalex + x as f32;
          let offset_y = ((displacement[idx + 1] as f32 - 127.0) / 127.0) * -scaley + y as f32;
          // The lowest 4 bits of the blue channel is the alpha
          let alpha = (displacement[idx + 2] & 0xf) as f32 / 15.0;

          // Clamp the offset to the bounds of the image
          let offset_x = offset_x.clamp(0.0, width_f32);
          let offset_y = offset_y.clamp(0.0, height_f32);

          let result = _bilinear_sample_float(&image, width, height, offset_x, offset_y);
          // let d_idx = (offset_y.floor() as usize * width + offset_x.floor() as usize) << 2;
          // let result = [image[d_idx], image[d_idx + 1], image[d_idx + 2], image[d_idx + 3]];

          buffer[idx] = result[0];
          buffer[idx + 1] = result[1];
          buffer[idx + 2] = result[2];
          buffer[idx + 3] = (result[3] as f32 * alpha) as u8;
      }
  }

  buffer
}

// This is the version of the function that uses floating point values for the offsets
// It is more straightforward, but it is also slower
fn _bilinear_sample_float(
    image: &[u8],
    width: usize,
    height: usize,
    x: f32,
    y: f32,
) -> [u8; 4] {
    let x0 = x.floor() as usize;
    let x1 = x0 + 1;
    let y0 = y.floor() as usize;
    let y1 = y0 + 1;

    let x0 = x0.clamp(0, width - 1);
    let x1 = x1.clamp(0, width - 1);
    let y0 = y0.clamp(0, height - 1);
    let y1 = y1.clamp(0, height - 1);

    let idx00 = (x0 + y0 * width) << 2;
    let idx01 = (x0 + y1 * width) << 2;
    let idx10 = (x1 + y0 * width) << 2;
    let idx11 = (x1 + y1 * width) << 2;

    let x0 = x0 as f32;
    let y0 = y0 as f32;

    let x = x - x0;
    let y = y - y0;
    
    let r00 = image[idx00] as f32;
    let r01 = image[idx01] as f32;
    let r10 = image[idx10] as f32;
    let r11 = image[idx11] as f32;

    let g00 = image[idx00 + 1] as f32;
    let g01 = image[idx01 + 1] as f32;
    let g10 = image[idx10 + 1] as f32;
    let g11 = image[idx11 + 1] as f32;

    let b00 = image[idx00 + 2] as f32;
    let b01 = image[idx01 + 2] as f32;
    let b10 = image[idx10 + 2] as f32;
    let b11 = image[idx11 + 2] as f32;

    let a00 = image[idx00 + 3] as f32;
    let a01 = image[idx01 + 3] as f32;
    let a10 = image[idx10 + 3] as f32;
    let a11 = image[idx11 + 3] as f32;

    let r0 = r00 + (r10 - r00) * x;
    let r1 = r01 + (r11 - r01) * x;

    let g0 = g00 + (g10 - g00) * x;
    let g1 = g01 + (g11 - g01) * x;

    let b0 = b00 + (b10 - b00) * x;
    let b1 = b01 + (b11 - b01) * x;

    let a0 = a00 + (a10 - a00) * x;
    let a1 = a01 + (a11 - a01) * x;

    let r = r0 + (r1 - r0) * y;
    let g = g0 + (g1 - g0) * y;
    let b = b0 + (b1 - b0) * y;
    let a = a0 + (a1 - a0) * y;

    [r as u8, g as u8, b as u8, a as u8]
}