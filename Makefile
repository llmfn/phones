.PHONY: run import

run:
	uv run flask --app app run --debug

import:
	uv run python -m scripts.import_phones
