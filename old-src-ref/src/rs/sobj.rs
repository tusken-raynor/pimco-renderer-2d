/// Deserialize a serialized .obj file
pub fn deserialize_sobj(data: Vec<u8>) -> String {
  // Grab the first byte to determine the section type
  // 0: Object
  // 1: Group
  // 2: Geometry Data

  let mut obj_string = String::new();
  let mut offset = 0;
  
  while offset < data.len() {
    let section_type = data[offset];
    offset += 1;

    match section_type {
      0 => {
        // Object
        let name_length = data[offset] as usize;
        offset += 1;
        let ascii_name = &data[offset..offset + name_length];
        offset += name_length;
        obj_string.push_str(&format!("o {}\n", String::from_utf8_lossy(ascii_name)));
      },
      1 => {
        // Group
        let name_length = data[offset] as usize;
        offset += 1;
        let ascii_name = &data[offset..offset + name_length];
        offset += name_length;
        obj_string.push_str(&format!("g {}\n", String::from_utf8_lossy(ascii_name)));
      },
      2 => {
        // Geometry Data
        // First up is vertex data, and the next 4 bytes are the number bytes the comprise the vertex data
        let vertex_data_length = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as usize;
        offset += 4;
        let vertex_data = &data[offset..offset + vertex_data_length];
        // Parse each set of four bytes as a float
        let mut vertex_offset = 0;
        while vertex_offset < vertex_data.len() {
          let x = f32::from_be_bytes([vertex_data[vertex_offset], vertex_data[vertex_offset + 1], vertex_data[vertex_offset + 2], vertex_data[vertex_offset + 3]]);
          let y = f32::from_be_bytes([vertex_data[vertex_offset + 4], vertex_data[vertex_offset + 5], vertex_data[vertex_offset + 6], vertex_data[vertex_offset + 7]]);
          let z = f32::from_be_bytes([vertex_data[vertex_offset + 8], vertex_data[vertex_offset + 9], vertex_data[vertex_offset + 10], vertex_data[vertex_offset + 11]]);
          vertex_offset += 12;
          obj_string.push_str(&format!("v {} {} {}\n", x, y, z));
        }
        offset += vertex_data_length;
        // Next up is the normal data
        let normal_data_length = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as usize;
        offset += 4;
        let normal_data = &data[offset..offset + normal_data_length];
        // Parse each set of four bytes as a float
        let mut normal_offset = 0;
        while normal_offset < normal_data.len() {
          let x = f32::from_be_bytes([normal_data[normal_offset], normal_data[normal_offset + 1], normal_data[normal_offset + 2], normal_data[normal_offset + 3]]);
          let y = f32::from_be_bytes([normal_data[normal_offset + 4], normal_data[normal_offset + 5], normal_data[normal_offset + 6], normal_data[normal_offset + 7]]);
          let z = f32::from_be_bytes([normal_data[normal_offset + 8], normal_data[normal_offset + 9], normal_data[normal_offset + 10], normal_data[normal_offset + 11]]);
          normal_offset += 12;
          obj_string.push_str(&format!("vn {} {} {}\n", x, y, z));
        }
        offset += normal_data_length;
        // Next up is the texture coordinate data
        let texcoord_data_length = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as usize;
        offset += 4;
        let texcoord_data = &data[offset..offset + texcoord_data_length];
        // Parse each set of four bytes as a float
        let mut texcoord_offset = 0;
        while texcoord_offset < texcoord_data.len() {
          let u = f32::from_be_bytes([texcoord_data[texcoord_offset], texcoord_data[texcoord_offset + 1], texcoord_data[texcoord_offset + 2], texcoord_data[texcoord_offset + 3]]);
          let v = f32::from_be_bytes([texcoord_data[texcoord_offset + 4], texcoord_data[texcoord_offset + 5], texcoord_data[texcoord_offset + 6], texcoord_data[texcoord_offset + 7]]);
          texcoord_offset += 8;
          obj_string.push_str(&format!("vt {} {}\n", u, v));
        }
        offset += texcoord_data_length;
        // offset = 3000;
        // Next up is the face data
        // This is where it get's weird.
        // First we have three u8 numbers that represent the number of bits each index takes up in order of vertex, texture coordinate, and normal respectively
        let vertex_index_bits = data[offset];
        let texcoord_index_bits = data[offset + 1];
        let normal_index_bits = data[offset + 2];
        let index_bits_list = [vertex_index_bits, texcoord_index_bits, normal_index_bits];
        offset += 3;
        // Next we have number of vertices of all the faces
        let num_vertices = u32::from_be_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]) as usize;
        // return format!("{:?}", num_vertices);
        offset += 4;
        // Next we have the face index data
        let face_data_length = (vertex_index_bits + texcoord_index_bits + normal_index_bits) as usize * num_vertices;
        let face_data_byte_count = (face_data_length as f32 / 8.0).ceil() as usize;
        let face_data = &data[offset..offset + face_data_byte_count];
        // We will use two u32s as bit buffers to read the indices from
        // That should be long enough to hold the largest index
        let mut bit_buffer1 = u32::from_be_bytes([*face_data.get(0).unwrap_or(&0), *face_data.get(1).unwrap_or(&0), *face_data.get(2).unwrap_or(&0), *face_data.get(3).unwrap_or(&0)]);
        let mut bit_buffer2 = u32::from_be_bytes([*face_data.get(4).unwrap_or(&0), *face_data.get(5).unwrap_or(&0), *face_data.get(6).unwrap_or(&0), *face_data.get(7).unwrap_or(&0)]);
        let mut bit_offset: u8 = 0;
        let mut indices: Vec<usize> = vec![];
        // Loop through the face data and push bits into the bit buffer
        let mut face_offset = 8;
        for _ in  0..num_vertices {
          for i in 0..index_bits_list.len() {
            let index_bits = index_bits_list[i];
            let index: u32 = bit_buffer1 >> (32 - index_bits);
            // Add the index to the indices list
            indices.push(index as usize);
            // Update the bit offset
            bit_offset += index_bits;
            // Shift the bits on the bit buffers by the bits count we just read
            bit_buffer1 <<= index_bits;
            bit_buffer1 |= bit_buffer2 >> (32 - index_bits);
            bit_buffer2 <<= index_bits;
            // If the offset is 32 or greater then we have moved bit_buffer2 completely
            // onto bit_buffer1, and we need to read the next byte
            if bit_offset >= 32 {
              bit_buffer2 = u32::from_be_bytes([*face_data.get(face_offset).unwrap_or(&0), *face_data.get(face_offset + 1).unwrap_or(&0), *face_data.get(face_offset + 2).unwrap_or(&0), *face_data.get(face_offset + 3).unwrap_or(&0)]);
              face_offset += 4;
              bit_offset -= 32;
            }
          }
        }
        // return format!("{:?}", indices);
        // Now we can write the face data to the obj string
        let mut i = 0;
        while i < indices.len() {
          let vertex_index1 = indices[i];
          let texcoord_index1 = indices[i + 1];
          let normal_index1 = indices[i + 2];
          let vertex_index2 = indices[i + 3];
          let texcoord_index2 = indices[i + 4];
          let normal_index2 = indices[i + 5];
          let vertex_index3 = indices[i + 6];
          let texcoord_index3 = indices[i + 7];
          let normal_index3 = indices[i + 8];
          obj_string.push_str(&format!("f {}/{}/{} {}/{}/{} {}/{}/{}\n", vertex_index1 + 1, texcoord_index1 + 1, normal_index1 + 1, vertex_index2 + 1, texcoord_index2 + 1, normal_index2 + 1, vertex_index3 + 1, texcoord_index3 + 1, normal_index3 + 1));
          i += 9;
        }
        offset += face_data_byte_count;
      },
      _ => {
        // Unknown section type
        break;
      }
    }
  }

  obj_string
}