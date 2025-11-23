from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from tempfile import NamedTemporaryFile
import shutil
from pathlib import Path

from analysis.features import analyze_track

app = FastAPI(title="Music Visualizer Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix or ".wav"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        temp_path = Path(temp_file.name)

    try:
        result = analyze_track(str(temp_path))
        return result
    finally:
        try:
            temp_path.unlink()
        except OSError:
            pass
