
.PHONY: layer1 layer2 layer3 layer4

layer1:
	uv run python layer1/app.py

layer2:
	uv run python layer2/app.py

layer3:
	uv run python layer3/app.py

layer4:
	uv run python layer4/app.py