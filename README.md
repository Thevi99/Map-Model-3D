# 3D Map Navigation 🏙🚀

## 📌 Overview
โครงการนี้ใช้ **Flask + Three.js + OpenStreetMap** เพื่อดึงข้อมูลอาคาร, ถนน และเส้นทางจาก Overpass API และแสดงผลเป็น **โมเดลแผนที่ 3D** 🚀

## 🛠 Features
- 🌍 **แสดงแผนที่ 3D** จาก OSM
- 🏗 **สร้างอาคาร 3D** จาก Overpass API
- 🚗 **นำทางเส้นทาง 3D** ด้วย OSRM
- 🏙 **รองรับ Bounding Box** สำหรับการดึงข้อมูลเฉพาะพื้นที่

## 🔧 Installation
```sh
git clone https://github.com/your-username/3D-Map-Navigation.git
cd 3D-Map-Navigation
pip install -r requirements.txt
python main.py
