import argparse
import json
import sys


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def load_model(model_path, device):
    try:
        from ultralytics import YOLO
        import torch
    except Exception as exc:
        emit({"type": "error", "message": f"Missing AI dependency: {exc}"})
        return None, "unavailable"

    selected_device = "cuda" if device == "auto" and torch.cuda.is_available() else device
    if selected_device == "auto":
        selected_device = "cpu"
    try:
        return YOLO(model_path), selected_device
    except Exception as exc:
        emit({"type": "error", "message": f"Failed to load YOLO model: {exc}"})
        return None, selected_device


def detect(model, device, confidence, frames):
    total = len(frames)
    for index, frame in enumerate(frames, start=1):
        try:
            results = model.predict(frame["imagePath"], conf=confidence, device=device, verbose=False)
            detections = []
            for result in results:
                names = result.names
                for box in result.boxes:
                    x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                    class_index = int(box.cls[0].item())
                    detections.append(
                        {
                            "className": names.get(class_index, str(class_index)),
                            "confidence": float(box.conf[0].item()),
                            "bbox": {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1},
                        }
                    )
            emit({"type": "result", "frameId": frame["frameId"], "detections": detections})
        except Exception as exc:
            emit({"type": "error", "message": f"Detection failed for {frame['imagePath']}: {exc}"})
        emit({"type": "progress", "completed": index, "total": total})
    emit({"type": "done"})


def main():
    parser = argparse.ArgumentParser(description="JSONL YOLO worker for Labeling Easier")
    parser.add_argument("--model", required=True)
    parser.add_argument("--confidence", type=float, default=0.25)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    args = parser.parse_args()

    model, device = load_model(args.model, args.device)
    emit({"type": "ready", "device": device})

    for line in sys.stdin:
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            emit({"type": "error", "message": f"Malformed request: {line.strip()}"})
            continue
        if message.get("type") == "detect":
            if model is None:
                emit({"type": "error", "message": "YOLO model is unavailable."})
                continue
            detect(model, device, args.confidence, message.get("frames", []))


if __name__ == "__main__":
    main()
