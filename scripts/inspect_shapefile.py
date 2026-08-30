from __future__ import annotations

import argparse
import struct
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    data = args.source.read_bytes()
    print("header_bbox", struct.unpack("<4d", data[36:68]))
    offset = 100
    for _ in range(3):
        record_number, content_words = struct.unpack(">2i", data[offset : offset + 8])
        body = data[offset + 8 : offset + 8 + content_words * 2]
        shape_type = struct.unpack("<i", body[:4])[0]
        bbox = struct.unpack("<4d", body[4:36])
        num_parts, num_points = struct.unpack("<2i", body[36:44])
        point_offset = 44 + num_parts * 4
        points = [
            struct.unpack("<2d", body[point_offset + index * 16 : point_offset + (index + 1) * 16])
            for index in range(min(num_points, 5))
        ]
        print(record_number, shape_type, bbox, num_parts, num_points, points)
        offset += 8 + content_words * 2


if __name__ == "__main__":
    main()
