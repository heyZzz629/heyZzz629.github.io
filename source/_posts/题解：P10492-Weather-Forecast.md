---
title: 题解：P10492 Weather Forecast
date: 2026-03-09 20:19:38
tags:
  - 题解
categories:
  - 题解
---
记忆化搜索+剪枝。

记忆化，记录：

- 目前到的点 $(x,y)$。
- 天数 $day$。
- 四个角的降雨量。

剪枝：

1. 如果活动时下雨，直接剪掉。
2. 如果四个角没有下雨 $\ge 7$ 天，直接剪掉。因为四个角地方被覆盖的情况是最少的。

代码:

```cpp
#include<bits/stdc++.h>
using namespace std;
int n,a[405][5][5],f[5][5][405][8][8][8][8];
int dx[]={-1,0,-2,0,2,0,1,0,0},dy[]={0,-1,0,-2,0,2,0,1,0};
int dfs(int x,int y,int day,int ex,int sx,int ey,int sy){
	if(f[x][y][day][ex][sx][ey][sy]!=-1)
		return f[x][y][day][ex][sx][ey][sy];
	for(int i=x;i<=x+1;i++) for(int j=y;j<=y+1;j++)
			if(a[day][i][j]==1) return 0;
	if(ex>=7||sx>=7||ey>=7||sy>=7) return 0;
	if(day==n) return 1;
	int ans=0;
	for(int i=0;i<9;i++){
		int tx=x+dx[i],ty=y+dy[i];
		if(1<=tx&&tx<=3&&1<=ty&&ty<=3){
			int a,b,c,d;
			if(tx==1&&ty==1)a=0;else a=ex+1;
			if(tx==3&&ty==1)b=0;else b=sx+1;
			if(tx==1&&ty==3)c=0;else c=ey+1;
			if(tx==3&&ty==3)d=0;else d=sy+1;
			ans|=dfs(tx,ty,day+1,a,b,c,d);
		}
	}if(f[x][y][day][ex][sx][ey][sy]==-1)
		f[x][y][day][ex][sx][ey][sy]=ans;
	return ans;
}int main(){
	while(1){
		memset(f,-1,sizeof(f)),cin>>n;
		if(n==0) break;
		for(int i=1;i<=n;i++) for(int j=1;j<=4;j++)
			for(int k=1;k<=4;k++) cin>>a[i][j][k];
		cout<<dfs(2,2,1,1,1,1,1)<<'\n';
	}
}
```