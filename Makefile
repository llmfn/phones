
ARGS=

.PHONY: run
run:
	uv run python app.py

.PHONY: check
check:
	uv run python app.py --check

.PHONY: eval
eval:
	uv run python app.py --eval

.PHONY: layer1
layer1:
	uv run python solutions/layer1/app.py $(ARGS)

.PHONY: layer2
layer2:
	uv run python solutions/layer2/app.py $(ARGS)

.PHONY: layer3
layer3:
	uv run python solutions/layer3/app.py $(ARGS)

.PHONY: layer4
layer4:
	uv run python solutions/layer4/app.py $(ARGS)

.PHONY: layer5
layer5:
	uv run python solutions/layer5/app.py $(ARGS)

.PHONY: layer6
layer6:
	uv run python solutions/layer6/app.py $(ARGS)

.PHONY: layer7
layer7:
	uv run python solutions/layer7/app.py $(ARGS)
