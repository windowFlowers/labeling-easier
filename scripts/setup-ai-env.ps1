param(
    [string]$Python = "python",
    [switch]$Cuda
)

$ErrorActionPreference = "Stop"

Write-Host "Checking Python..." -ForegroundColor Cyan
& $Python --version

Write-Host "Upgrading pip..." -ForegroundColor Cyan
& $Python -m pip install --upgrade pip

if ($Cuda) {
    Write-Host "Installing PyTorch CUDA build. Adjust the index URL if your CUDA version differs." -ForegroundColor Yellow
    & $Python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
} else {
    Write-Host "Installing PyTorch CPU build..." -ForegroundColor Cyan
    & $Python -m pip install torch torchvision
}

Write-Host "Installing YOLO and media dependencies..." -ForegroundColor Cyan
& $Python -m pip install ultralytics opencv-python pillow

Write-Host "AI environment setup finished. Configure this Python path and your .pt model in Labeling Easier." -ForegroundColor Green
