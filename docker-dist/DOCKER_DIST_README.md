cd honeyjar-server
docker build -t honeyjar-server:latest -f docker-setup/Dockerfile.dev .

docker save honeyjar-server:latest -o docker-dist/honeyjar-server-image.tar

Package the following files into a zip or folder to share:
   honeyjar-server-image.tar
   docker-compose.yml
   run-dist.sh
   run-dist.ps1
   README.md

The person receiving your package would:
   docker load -i honeyjar-server-image.tar
   .\run-dist.ps1
OR
   chmod +x run-dist.sh && ./run-dist.sh