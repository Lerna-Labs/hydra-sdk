# Load .env automatically (Compose will do this too, but we can echo for sanity)
include .env
export

# Compose file picker
export COMPOSE_FILE = docker/docker-compose.${NETWORK}.yml

.PHONY: hydra-up hydra-down hydra-logs hydra-restart

hydra-up:
	docker compose up -d

hydra-down:
	docker compose down

hydra-reset:
	$(MAKE) hydra-down && sudo rm -rf scripts/${NETWORK}/config/persistence

hydra-logs:
	docker compose logs -f

hydra-restart:
	$(MAKE) hydra-down && $(MAKE) hydra-up

test-x:
	echo ${SCRIPTS_DIR_OFFLINE}