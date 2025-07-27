# Load .env automatically (Compose will do this too, but we can echo for sanity)
include .env
export

# Compose file picker
export COMPOSE_FILE = docker/docker-compose.${NETWORK}.yml

# List of make commands
HYDRA_TARGETS := hydra-up hydra-down hydra-logs hydra-restart hydra-status hydra-stats

.PHONY: $(HYDRA_TARGETS)
.SILENT: $(HYDRA_TARGETS)

hydra-up:
	docker compose up -d

hydra-down:
	docker compose down

hydra-reset:
	$(MAKE) hydra-down && \
	sudo rm -rf scripts/${NETWORK}/config/persistence && \
	$(MAKE) hydra-up

hydra-logs:
	docker compose logs -f --tail=100

hydra-restart:
	$(MAKE) hydra-down && $(MAKE) hydra-up

hydra-status:
	docker compose ps

# Press CTRL + C twice to exit out of container stats
hydra-stats:
	docker stats $$(docker compose ps --services | xargs -I {} docker compose ps -q {})
