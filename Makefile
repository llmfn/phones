
.PHONY: run
run:
	uv run python app.py

.PHONY: layer1
layer1:
	uv run python solutions/layer1/app.py

.PHONY: layer2
layer2:
	uv run python solutions/layer2/app.py

.PHONY: layer3
layer3:
	uv run python solutions/layer3/app.py

.PHONY: layer4
layer4:
	uv run python solutions/layer4/app.py

.PHONY: layer5
layer5:
	uv run python solutions/layer5/app.py

.PHONY: layer6
layer6:
	uv run python solutions/layer6/app.py

.PHONY: layer7
layer7:
	uv run python solutions/layer7/app.py
