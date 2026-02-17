// use base64::encode;

// Function to calculate brightness from an RGB value
fn calculate_brightness(r: u8, g: u8, b: u8) -> u8 {
  (((r as u16) + (((g as u32) * 356) >> 8) as u16 + (((b as u16) * 156) >> 8)) / 3) as u8
}

// Function to parse a hex string and return an RGB tuple
fn parse_hex(hex: &str) -> Option<(u8, u8, u8)> {
  let hex = hex.trim_start_matches('#');
  match hex.len() {
      3 => {
          let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
          let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
          let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
          Some((r, g, b))
      }
      6 => {
          let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
          let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
          let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
          Some((r, g, b))
      }
      _ => None,
  }
}

// Function to parse an rgb() string and return an RGB tuple
fn parse_rgb(rgb: &str) -> Option<(u8, u8, u8)> {
  let rgb = rgb.trim_start_matches("rgb(").trim_end_matches(')');
  let parts: Vec<&str> = rgb.split(',').map(|s| s.trim()).collect();
  if parts.len() == 3 {
      let r = parts[0].parse::<u8>().ok()?;
      let g = parts[1].parse::<u8>().ok()?;
      let b = parts[2].parse::<u8>().ok()?;
      Some((r, g, b))
  } else {
      None
  }
}

pub fn get_brightness(color: &str) -> u8 {
  if let Some((r, g, b)) = parse_hex(color) {
      calculate_brightness(r, g, b)
  } else if let Some((r, g, b)) = parse_rgb(color) {
      calculate_brightness(r, g, b)
  } else {
      0 // Return 0 brightness if the input is not valid
  }
}

// Generates a BMP image data URL from an RGBA color array (e.g., [255, 0, 0, 255] for red).
// Returns a Base64-encoded data URL of a 1x1 BMP image.
// pub fn create_bmp_from_color(color: [u8; 4]) -> String {
//     let [r, g, b, a] = color;

//     // BMP header and DIB header for a 1x1 pixel image
//     let bmp_header: [u8; 54] = [
//         0x42, 0x4D,              // Signature "BM"
//         0x3A, 0x00, 0x00, 0x00,  // File size: 54 bytes header + 4 bytes pixel data
//         0x00, 0x00,              // Reserved
//         0x00, 0x00,              // Reserved
//         0x36, 0x00, 0x00, 0x00,  // Offset to pixel array (54 bytes)

//         // DIB header (40 bytes)
//         0x28, 0x00, 0x00, 0x00,  // DIB header size (40 bytes)
//         0x01, 0x00, 0x00, 0x00,  // Width: 1 pixel
//         0x01, 0x00, 0x00, 0x00,  // Height: 1 pixel
//         0x01, 0x00,              // Color planes: 1
//         0x20, 0x00,              // Bits per pixel: 32 (RGBA)
//         0x00, 0x00, 0x00, 0x00,  // Compression: none
//         0x04, 0x00, 0x00, 0x00,  // Raw bitmap data size (4 bytes for 1x1 RGBA)
//         0x13, 0x0B, 0x00, 0x00,  // Horizontal resolution (2835 pixels/meter)
//         0x13, 0x0B, 0x00, 0x00,  // Vertical resolution (2835 pixels/meter)
//         0x00, 0x00, 0x00, 0x00,  // Colors in color table (none for 32-bit BMP)
//         0x00, 0x00, 0x00, 0x00,  // Important color count (all colors are important)
//     ];

//     // Pixel array: BGRA format
//     let pixel_data = [b, g, r, a];

//     // Combine header and pixel data into a single Vec<u8>
//     let mut bmp_data = Vec::with_capacity(bmp_header.len() + pixel_data.len());
//     bmp_data.extend_from_slice(&bmp_header);
//     bmp_data.extend_from_slice(&pixel_data);

//     // Encode as Base64 and create a data URL
//     let base64_data = encode(bmp_data);
//     format!("data:image/bmp;base64,{}", base64_data)
// }

pub fn css_color_to_rgba(color: &str) -> u32 {

    if let Some(hex) = color.strip_prefix('#') {
        match hex.len() {
            6 => {
                // Format #RRGGBB, alpha assumed to be 255
                let r = hex_to_dec(&hex[0..2]).unwrap_or(0);
                let g = hex_to_dec(&hex[2..4]).unwrap_or(0);
                let b = hex_to_dec(&hex[4..6]).unwrap_or(0);
                return (r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | 255;
            }
            8 => {
                // Format #RRGGBBAA
                let r = hex_to_dec(&hex[0..2]).unwrap_or(0);
                let g = hex_to_dec(&hex[2..4]).unwrap_or(0);
                let b = hex_to_dec(&hex[4..6]).unwrap_or(0);
                let a = hex_to_dec(&hex[6..8]).unwrap_or(0);
                return (r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | a as u32;
            }
            3 => {
                // Format #RGB, alpha assumed to be 255
                let r = hex_to_dec(&hex[0..1].repeat(2)).unwrap_or(0);
                let g = hex_to_dec(&hex[1..2].repeat(2)).unwrap_or(0);
                let b = hex_to_dec(&hex[2..3].repeat(2)).unwrap_or(0);
                return (r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | 255;
            }
            4 => {
                // Format #RGBA
                let r = hex_to_dec(&hex[0..1].repeat(2)).unwrap_or(0);
                let g = hex_to_dec(&hex[1..2].repeat(2)).unwrap_or(0);
                let b = hex_to_dec(&hex[2..3].repeat(2)).unwrap_or(0);
                let a = hex_to_dec(&hex[3..4].repeat(2)).unwrap_or(0);
                return (r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | a as u32;
            }
            _ => return 0,
        }
    } else if color.starts_with("hsl") {
        // Parse HSL(A)
        let parts: Vec<f32> = color
            .trim_start_matches("hsl")
            .trim_start_matches("a")
            .trim_matches(['(', ')'])
            .split(',')
            .map(|s| s.trim().replace('%', "").parse().unwrap_or(0.0))
            .collect();

        if parts.len() < 3 { return 0; }
        let (h, s, l) = (parts[0], parts[1] / 100.0, parts[2] / 100.0);
        let a = if color.starts_with("hsla") && parts.len() > 3 { (parts[3] * 255.0).round() as u8 } else { 255 };

        let (r, g, b) = hsl_to_rgb(h, s, l);
        return (r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | a as u32;
    } else if color.starts_with("rgb") {
        // Parse RGB(A)
        let parts: Vec<f32> = color
            .trim_start_matches("rgb")
            .trim_start_matches("a")
            .trim_matches(['(', ')'])
            .split(',')
            .map(|s| s.trim().replace('%', "").parse().unwrap_or(0.0))
            .collect();

        if parts.len() < 3 { return 0; }
        let r = parts[0].round() as u8;
        let g = parts[1].round() as u8;
        let b = parts[2].round() as u8;
        let a = if color.starts_with("rgba") && parts.len() > 3 { (parts[3] * 255.0).round() as u8 } else { 255 };

        return (r as u32) << 24 | (g as u32) << 16 | (b as u32) << 8 | a as u32;
    }
    0
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (u8, u8, u8) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;

    let (r, g, b) = match h {
        h if h < 60.0 => (c, x, 0.0),
        h if h < 120.0 => (x, c, 0.0),
        h if h < 180.0 => (0.0, c, x),
        h if h < 240.0 => (0.0, x, c),
        h if h < 300.0 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };

    (
        ((r + m) * 255.0).round() as u8,
        ((g + m) * 255.0).round() as u8,
        ((b + m) * 255.0).round() as u8,
    )
}

fn hex_to_dec(hex: &str) -> Option<u8> {
  u8::from_str_radix(hex, 16).ok()
}

pub fn rgb565_to_rgb(color: u16) -> u32 {
  let r = ((color >> 8) & 0b11111000) as u32;
  let g = ((color >> 3) & 0b11111100) as u32;
  let b = ((color & 0b00011111) << 3) as u32;
  r << 16 | g << 8 | b
}

pub fn rgb_to_rgb565(color: u32) -> u16 {
  let r = ((color >> 16) & 0xFF) as u16;
  let g = ((color >> 8) & 0xFF) as u16;
  let b = (color & 0xFF) as u16;
  (r >> 3) << 11 | (g >> 2) << 5 | (b >> 3)
}