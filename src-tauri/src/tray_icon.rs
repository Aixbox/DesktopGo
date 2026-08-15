use tauri::image::Image;

const LOGICAL_TRAY_ICON_SIZE: f64 = 16.0;
const MIN_TRAY_ICON_SIZE: u32 = 16;
const MAX_TRAY_ICON_SIZE: u32 = 64;
const EDGE_SAMPLE_GRID: u32 = 4;

const TRANSPARENT: [u8; 4] = [0, 0, 0, 0];
const OUTER_BORDER: [u8; 4] = [79, 78, 106, 255];
const OUTER_FILL: [u8; 4] = [39, 38, 67, 255];
const ACTIVE_BORDER: [u8; 4] = [166, 132, 255, 255];
const ACTIVE_FILL: [u8; 4] = [116, 96, 176, 255];
const INACTIVE_BORDER: [u8; 4] = [183, 182, 193, 255];

#[derive(Clone, Copy)]
struct GridGeometry {
    first: u32,
    second: u32,
    cell_size: u32,
    stroke: u32,
}

pub(crate) fn build(scale_factor: f64) -> Image<'static> {
    let size = physical_size(scale_factor);
    Image::new_owned(render_rgba(size), size, size)
}

fn physical_size(scale_factor: f64) -> u32 {
    let scale_factor = if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    };
    (LOGICAL_TRAY_ICON_SIZE * scale_factor)
        .round()
        .clamp(MIN_TRAY_ICON_SIZE as f64, MAX_TRAY_ICON_SIZE as f64) as u32
}

fn grid_geometry(size: u32) -> GridGeometry {
    let first = ((size as f64) * 0.19).round() as u32;
    let cell_size = ((size as f64) * 0.25).round() as u32;
    GridGeometry {
        first,
        second: size - first - cell_size,
        cell_size,
        stroke: ((size as f64) / 20.0).round().max(1.0) as u32,
    }
}

fn render_rgba(size: u32) -> Vec<u8> {
    let mut rgba = vec![0; (size * size * 4) as usize];
    let radius = ((size as f64) * 0.2).round().max(2.0);
    let border_width = ((size as f64) / 24.0).round().max(1.0);

    for y in 0..size {
        for x in 0..size {
            let color = render_outer_pixel(x, y, size, radius, border_width);
            set_pixel(&mut rgba, size, x, y, color);
        }
    }

    let grid = grid_geometry(size);
    paint_cell(&mut rgba, size, grid, (grid.first, grid.first), true);
    paint_cell(&mut rgba, size, grid, (grid.second, grid.first), false);
    paint_cell(&mut rgba, size, grid, (grid.first, grid.second), false);
    paint_cell(&mut rgba, size, grid, (grid.second, grid.second), false);
    rgba
}

fn render_outer_pixel(x: u32, y: u32, size: u32, radius: f64, border: f64) -> [u8; 4] {
    let mut color_sum = [0_u32; 3];
    let mut covered_samples = 0_u32;
    for sample_y in 0..EDGE_SAMPLE_GRID {
        for sample_x in 0..EDGE_SAMPLE_GRID {
            let offset_x = (sample_x as f64 + 0.5) / EDGE_SAMPLE_GRID as f64;
            let offset_y = (sample_y as f64 + 0.5) / EDGE_SAMPLE_GRID as f64;
            let color = if inside_rounded_square(
                x as f64 + offset_x,
                y as f64 + offset_y,
                size,
                border,
                (radius - border).max(1.0),
            ) {
                OUTER_FILL
            } else if inside_rounded_square(
                x as f64 + offset_x,
                y as f64 + offset_y,
                size,
                0.0,
                radius,
            ) {
                OUTER_BORDER
            } else {
                continue;
            };
            covered_samples += 1;
            for channel in 0..3 {
                color_sum[channel] += color[channel] as u32;
            }
        }
    }

    if covered_samples == 0 {
        return TRANSPARENT;
    }
    let total_samples = EDGE_SAMPLE_GRID * EDGE_SAMPLE_GRID;
    [
        (color_sum[0] / covered_samples) as u8,
        (color_sum[1] / covered_samples) as u8,
        (color_sum[2] / covered_samples) as u8,
        ((covered_samples * 255) / total_samples) as u8,
    ]
}

fn inside_rounded_square(point_x: f64, point_y: f64, size: u32, inset: f64, radius: f64) -> bool {
    let min = inset;
    let max = size as f64 - inset;
    if point_x < min || point_y < min || point_x >= max || point_y >= max {
        return false;
    }
    let closest_x = point_x.clamp(min + radius, max - radius);
    let closest_y = point_y.clamp(min + radius, max - radius);
    let delta_x = point_x - closest_x;
    let delta_y = point_y - closest_y;
    delta_x * delta_x + delta_y * delta_y <= radius * radius
}

fn paint_cell(
    rgba: &mut [u8],
    image_size: u32,
    grid: GridGeometry,
    position: (u32, u32),
    active: bool,
) {
    let (left, top) = position;
    for y in top..top + grid.cell_size {
        for x in left..left + grid.cell_size {
            let local_x = x - left;
            let local_y = y - top;
            let border = local_x < grid.stroke
                || local_y < grid.stroke
                || local_x >= grid.cell_size - grid.stroke
                || local_y >= grid.cell_size - grid.stroke;
            let color = match (active, border) {
                (true, true) => ACTIVE_BORDER,
                (true, false) => ACTIVE_FILL,
                (false, true) => INACTIVE_BORDER,
                (false, false) => continue,
            };
            set_pixel(rgba, image_size, x, y, color);
        }
    }
}

fn set_pixel(rgba: &mut [u8], size: u32, x: u32, y: u32, color: [u8; 4]) {
    let offset = ((y * size + x) * 4) as usize;
    rgba[offset..offset + 4].copy_from_slice(&color);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pixel(rgba: &[u8], size: u32, x: u32, y: u32) -> [u8; 4] {
        let offset = ((y * size + x) * 4) as usize;
        rgba[offset..offset + 4].try_into().unwrap()
    }

    #[test]
    fn scales_to_physical_tray_pixels() {
        assert_eq!(physical_size(1.0), 16);
        assert_eq!(physical_size(1.25), 20);
        assert_eq!(physical_size(1.5), 24);
        assert_eq!(physical_size(2.0), 32);
    }

    #[test]
    fn keeps_all_grid_corners_square_and_pixel_aligned() {
        let size = 20;
        let rgba = render_rgba(size);
        let grid = grid_geometry(size);
        for (left, top, expected_color) in [
            (grid.first, grid.first, ACTIVE_BORDER),
            (grid.second, grid.first, INACTIVE_BORDER),
            (grid.first, grid.second, INACTIVE_BORDER),
            (grid.second, grid.second, INACTIVE_BORDER),
        ] {
            assert_eq!(pixel(&rgba, size, left, top), expected_color);
            assert_eq!(
                pixel(
                    &rgba,
                    size,
                    left + grid.cell_size - 1,
                    top + grid.cell_size - 1,
                ),
                expected_color
            );
        }
    }

    #[test]
    fn antialiases_only_the_outer_rounded_edge() {
        let size = 20;
        let rgba = render_rgba(size);
        let edge_alpha = pixel(&rgba, size, 0, 2)[3];
        assert!(edge_alpha > 0 && edge_alpha < 255);

        let grid = grid_geometry(size);
        assert_eq!(pixel(&rgba, size, grid.first, grid.first)[3], 255);
    }
}
