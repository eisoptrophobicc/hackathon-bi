import requests
from pathlib import Path

CSV_URL = "https://drive.google.com/uc?export=download&id=1iIItBZhcSixQlneNgySxxvaNi7VfSNK8"

SAVE_PATH = Path(__file__).parent / "backend" / "YouTube Content Creation.csv"


def download_csv():
    print("Downloading dataset...")

    response = requests.get(CSV_URL, stream=True)

    if response.status_code != 200:
        print("Download failed.")
        return

    with open(SAVE_PATH, "wb") as f:
        for chunk in response.iter_content(8192):
            f.write(chunk)

    print("Dataset downloaded successfully.")
    print(f"Saved to: {SAVE_PATH}")


if __name__ == "__main__":
    download_csv()