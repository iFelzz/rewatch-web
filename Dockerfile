# GANTI ke versi "bullseye" (Lengkap) jangan yang "slim"
# Ini isinya udah ada Python & Build Tools dasar
FROM node:18-bullseye

# Install FFmpeg & Python (Wajib buat engine downloader)
# Tambah build-essential buat jaga-jaga kalau ada npm yg butuh compile
RUN apt-get update && \
    apt-get install -y ffmpeg python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Set folder kerja
WORKDIR /app

# Copy package.json
COPY package*.json ./

# Install dependencies
# Tambah --unsafe-perm biar gak rewel soal permission root
RUN npm install --production --unsafe-perm

# Copy sisa codingan
COPY . .

# Bikin folder download
RUN mkdir -p downloads

# Buka Port
EXPOSE 3000

# Jalanin
CMD ["node", "server.js"]