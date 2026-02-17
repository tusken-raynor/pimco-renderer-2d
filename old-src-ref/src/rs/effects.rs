use super::utils::bmpc_unshift;

const SOBEL_KERNEL_N: [i8; 9] = [
  1, 0, -1,
  2, 0, -2,
  1, 0, -1
];
const SOBEL_KERNEL_NE: [i8; 9] = [
  2, 1, 0,
  1, 0, -1,
  0, -1, -2
];
const SOBEL_KERNEL_E: [i8; 9] = [
  1, 2, 1,
  0, 0, 0,
  -1, -2, -1
];
const SOBEL_KERNEL_SE: [i8; 9] = [
  0, 1, 2,
  -1, 0, 1,
  -2, -1, 0
];
const SOBEL_KERNEL_S: [i8; 9] = [
  -1, 0, 1,
  -2, 0, 2,
  -1, 0, 1
];
const SOBEL_KERNEL_SW: [i8; 9] = [
  -2, -1, 0,
  -1, 0, 1,
  0,  1, 2
];
const SOBEL_KERNEL_W: [i8; 9] = [
  -1, -2, -1,
  0, 0, 0,
  1, 2, 1
];
const SOBEL_KERNEL_NW: [i8; 9] = [
  0, -1, -2,
  1, 0, -1,
  2, 1, 0
];
const SOBEL_KERNELS: [[i8; 9]; 8] = [
  SOBEL_KERNEL_N,
  SOBEL_KERNEL_NE,
  SOBEL_KERNEL_E,
  SOBEL_KERNEL_SE,
  SOBEL_KERNEL_S,
  SOBEL_KERNEL_SW,
  SOBEL_KERNEL_W,
  SOBEL_KERNEL_NW
];

pub fn sobel_normal_map(input_buffer: Vec<u8>, width: usize, height: usize, direction_index: usize) -> Vec<u8> {
  let mut output_buffer = vec![0; input_buffer.len()];

  let kernel_x_index = direction_index;
  let kernel_y_index = (direction_index + 2) % 8;

  // Sobel convolution kernels for X and Y gradients
  let kernel_x: [i8; 9] = SOBEL_KERNELS[kernel_x_index];
  let kernel_y: [i8; 9] = SOBEL_KERNELS[kernel_y_index];


  let mut column: usize = 0;
  for y in 0..height {
    for x in 0..width {
      let gradient_x = apply_kernel(&input_buffer, x, y, width, height, kernel_x) as f32;
      let gradient_y = apply_kernel(&input_buffer, x, y, width, height, kernel_y) as f32;

      // Normalize the vector (gradientX, gradientY, 255)
      let gradient_z: f32 = 255.0;
      let length = (gradient_x * gradient_x + gradient_y * gradient_y + gradient_z * gradient_z).sqrt();
      let nx = ((gradient_x / length) * 128.0) as i8;
      let ny = ((gradient_y / length) * 128.0) as i8;
      let nz = ((gradient_z / length) * 128.0) as i8;

      let index = (column + x) << 2;
      output_buffer[index] = bmpc_unshift(nx); // X to red channel
      output_buffer[index + 1] = bmpc_unshift(ny); // Y to green channel
      output_buffer[index + 2] = (nz << 1) as u8; // Z to blue channel
      output_buffer[index + 3] = 255; // Alpha
    }
    column += width;
  }

  // Apply the normal map to the canvas
  output_buffer
}

// fn get_height(input_buffer: Vec<u8>, index: usize) {
//   const index = (y * width + x) * 4; // Access red channel (grayscale)
//   return pixels[index]; // Use red as the height
// }

fn apply_kernel(input_buffer: &Vec<u8>, x: usize, y: usize, width: usize, height: usize, kernel: [i8; 9]) -> i16 {
  let ix = x as isize;
  let iy = y as isize;
  let iwidth = width as isize;
  let iheight = height as isize;
  let mut value = 0;
  let mut index = 0;
  let mut ky: isize = -1;
  while ky <= 1 {
    let mut kx: isize = -1;
    while kx <= 1 {
      let px = ix + kx;
      let py = iy + ky;
      if px >= 0 && px < iwidth && py >= 0 && py < iheight {
        let buffer_idx = ((py * iwidth + px) * 4) as usize;
        value += (input_buffer[buffer_idx] as isize) * (kernel[index] as isize);
      }
      index += 1;
      kx += 1;
    }
    ky += 1;
  }
  return value as i16;
}