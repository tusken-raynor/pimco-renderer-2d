const BUFFER_WIDTH: usize = 320;

fn resize_nearest(buffer: &Vec<u8>, width: usize, height: usize, new_width: usize, new_height: usize, avg_alpha: &mut u8) -> Vec<u8> {
  let mut new_buffer = vec![0; new_width * new_height * 4];
  let mut ox: f32 = 0.0;
  let mut oy: f32 = 0.0;
  let mut alpha_sum: u32 = 0;
  let mut alpha_count: u32 = 0;
  let ox_step = width as f32 / new_width as f32;
  let oy_step = height as f32 / new_height as f32;
  for y in 0..new_height {
    for x in 0..new_width {
      let old_index = (oy.floor() * (width as f32) + ox.floor()) as usize * 4;
      let new_index = (y * new_width + x) * 4;
      new_buffer[new_index] = buffer[old_index];
      new_buffer[new_index + 1] = buffer[old_index + 1];
      new_buffer[new_index + 2] = buffer[old_index + 2];
      let alpha = buffer[old_index + 3];
      new_buffer[new_index + 3] = alpha;
      let inc = (alpha > 10) as u32;
      alpha_sum = alpha_sum.saturating_add((alpha as u32) * inc);
      alpha_count = 16843009.min(inc + alpha_count);
      ox += ox_step;
    }
    ox = 0.0;
    oy += oy_step;
  }

  *avg_alpha = if alpha_count > 0 { (alpha_sum / alpha_count) as u8 } else { 0 };
  // If the average alpha is very low, we can assume the image is mostly transparent
  // and set the average alpha to 255 to avoid issues with region map processing
  if *avg_alpha < 25 {
    *avg_alpha = 255;
  }

  new_buffer
}

// Scale the buffer down by a factor, and a cluster of pixels size factor^2
// will be averaged out to be the values of the new pixels
// We will also handle the alpha channel mapping transformation
fn cluster_scale(buffer: &Vec<u8>, width: usize, height: usize, color: [u8; 3], scale: usize, alpha_bias: u8) -> Vec<u8> {
  let scale_squared = (scale * scale) as u32;
  let new_width = width / scale;
  let new_height = height / scale;
  let mut new_buffer = vec![0; new_width * new_height * 4];
  for y in 0..new_height {
    for x in 0..new_width {
      let mut alpha: u32 = 0;
      for j in 0..scale {
        for i in 0..scale {
          let index = ((y * scale + j) * width + (x * scale + i)) * 4;
          alpha += buffer[index + 3] as u32;
        }
      }
      let new_index = (y * new_width + x) * 4;
      new_buffer[new_index] = color[0];
      new_buffer[new_index + 1] = color[1];
      new_buffer[new_index + 2] = color[2];
      new_buffer[new_index + 3] = modify_alpha((alpha / scale_squared) as u8, alpha_bias);
    }
  }
  new_buffer
}

// Take an alpha value and modify it to be either 0 or 255 where the threshold is 64.
fn modify_alpha(alpha: u8, alpha_bias: u8) -> u8 {
  let sb1 = (alpha >> alpha_bias - 1) & 1;
  let sb2 = alpha >> alpha_bias;
  (sb1 | sb2) * 255
}

pub fn get_region_map_image(buffer: &Vec<u8>, width: usize, height: usize, color: [u8; 3]) -> Vec<u8> {
  // Calculate the new width and height of the resized buffer
  let resized_width = BUFFER_WIDTH;
  let resized_height = (height as f32 / (width as f32 / BUFFER_WIDTH as f32)).round() as usize;
  // Calculate closest number to the width that is a multiple of BUFFER_WIDTH
  let scale = (width as f32 / resized_width as f32).round() as usize;
  let mut avg_alpha = 0u8;
  // If the scale is 1 or less, we can just run a nearest resize up to the resized width and height
  if scale <= 1 {
    let mut resized_buffer = resize_nearest(buffer, width, height, resized_width, resized_height, &mut avg_alpha);
    let alpha_bias = (7 - avg_alpha.leading_zeros()).max(4) as u8;
    // Loop through the pixels to process the alpha and set the correct color
    for i in (0..resized_buffer.len()).step_by(4) {
      resized_buffer[i] = color[0];
      resized_buffer[i + 1] = color[1];
      resized_buffer[i + 2] = color[2];
      resized_buffer[i + 3] = modify_alpha(resized_buffer[i + 3], alpha_bias);
    }
    return resized_buffer;
  }
  let nearest_width = scale * resized_width;
  let nearest_height = scale * resized_height;
  // Resize the buffer to the nearest width and height. Because the size change isn't very different
  // the nearest sampling technique wont be very noticeable
  let nearest_buffer = resize_nearest(buffer, width, height, nearest_width, nearest_height, &mut avg_alpha);
  let alpha_bias = (7 - avg_alpha.leading_zeros()).max(4) as u8;
  // Now we can cluster scale the buffer to the desired width and height
  cluster_scale(&nearest_buffer, nearest_width, nearest_height, color, scale, alpha_bias)
}

pub fn get_resize_dimensions(width: usize, height: usize) -> (usize, usize) {
  let resized_width = BUFFER_WIDTH;
  let resized_height = (height as f32 / (width as f32 / BUFFER_WIDTH as f32)).round() as usize;
  (resized_width, resized_height)
}

pub fn combine_region_map_images(region_map_images: Vec<Vec<u8>>) -> Vec<u8> {
  let mut combined_image = region_map_images[0].clone();
  let buffer_len = combined_image.len();
  let images_len = region_map_images.len();
  let mut i = 1;
  while i < images_len {
    let mut j = 3;
    let image = &region_map_images[i];
    while j < buffer_len {
      // Only the alpha channel needs the masking
      combined_image[j] &= image[j];
      j += 4;
    }
    i += 1;
  }
  combined_image
}