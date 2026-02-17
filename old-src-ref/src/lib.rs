use rs::displacements;
use rs::regionmap;
use wasm_bindgen::prelude::wasm_bindgen;

mod rs {
    pub mod displacements;
    pub mod utils;
    pub mod color;
    pub mod regionmap;
    pub mod effects;
    pub mod sobj;
    pub mod reciprocal;
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn displaceImage(
    image: Vec<u8>,
    displacement: Vec<u8>,
    width: usize,
    height: usize,
    scalex: f32,
    scaley: f32,
) -> Vec<u8> {
  
    displacements::apply_displacement_to_buffer(image, displacement, width, height, scalex, scaley)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn reverseString(str: String) -> String {
  let mut reversed = String::new();
  for c in str.chars().rev() {
    reversed.push(c);
  }
  reversed
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn getRegionMapDimensions(width: usize, height: usize) -> Vec<usize> {
  let (width, height) = regionmap::get_resize_dimensions(width, height);
  vec![width, height]
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn getRegionMapImage(data_buffer: Vec<u8>, color: u32) -> Vec<u8> {
  let mut region_map_images: Vec<Vec<u8>> = vec![];

  let len = data_buffer.len();
  let mut offset: usize = 0;
  while offset < len {
    // The first 4 bytes of the buffer is the length of the first data section
    let data_section_length = u32::from_le_bytes([ data_buffer[offset], data_buffer[offset + 1], data_buffer[offset + 2], data_buffer[offset + 3] ]) as usize;

    // The next 2 bytes of the buffer is the width of the image
    let width = u16::from_le_bytes([ data_buffer[offset + 4], data_buffer[offset + 5] ]) as usize;
    // The next 2 bytes of the buffer is the height of the image
    let height = u16::from_le_bytes([ data_buffer[offset + 6], data_buffer[offset + 7] ]) as usize;

    // The rest of elements in the buffer is the image data up until the next data section starts
    let image_data = &data_buffer[offset + 8..offset + data_section_length].to_vec();

    // Convert the color to a u8 array
    let color = [
      ((color >> 16) & 0xFF) as u8,
      ((color >> 8) & 0xFF) as u8,
      (color & 0xFF) as u8
    ];

    // Get the region map image
    let region_map_image = regionmap::get_region_map_image(image_data, width, height, color);
    region_map_images.push(region_map_image);

    // Move the offset to the next data section
    offset += data_section_length;
  }

  // If there are multiple region map images, we will combine them into one image
  if region_map_images.len() < 2 {
    return region_map_images.get(0).unwrap().to_vec();
  }
  
  regionmap::combine_region_map_images(region_map_images)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn getBrightness(color: &str) -> u8 {
  rs::color::get_brightness(color)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn sobelNormalMap(data_buffer: Vec<u8>, width: usize, height: usize, direction_index: usize) -> Vec<u8> {
  rs::effects::sobel_normal_map(data_buffer, width, height, direction_index)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn cssColor2RGBAInt(color: &str) -> u32 {
  rs::color::css_color_to_rgba(color)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn deserializeSobj(data: Vec<u8>) -> String {
  rs::sobj::deserialize_sobj(data)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn rgb565ToRgb(color: u16) -> u32 {
  rs::color::rgb565_to_rgb(color)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn rgbToRgb565(color: u32) -> u16 {
  rs::color::rgb_to_rgb565(color)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn reciprocal(num: i32) -> i32 {
  rs::reciprocal::recip(num)
}

#[allow(non_snake_case)] // Disable to allow for JS camelCase
#[wasm_bindgen]
pub fn getLUT() -> Vec<i32> {
  rs::reciprocal::send_lut().to_vec()
}


// FOR DEBUGGING
#[wasm_bindgen]
extern "C" {
    // Use `js_namespace` here to bind `console.log(..)` instead of just
    // `log(..)`
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);

    // The `console.log` is quite polymorphic, so we can bind it with multiple
    // signatures. Note that we need to use `js_name` to ensure we always call
    // `log` in JS.
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_u32(a: u32);

    // Multiple arguments too!
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log_many(a: &str, b: &str);
}